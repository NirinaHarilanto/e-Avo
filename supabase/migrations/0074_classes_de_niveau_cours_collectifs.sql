-- Classes de niveau au sein d'une promotion — demande client du 2026-09-23 : une vague (qui
-- devient conceptuellement une "promotion") n'est plus directement la classe. Elle regroupe
-- désormais 1 à N classes, une par niveau (Beginner/Intermediate/Advanced), chacune avec son
-- propre professeur et son propre créneau horaire. On garde `cohorts.teacher_id`/
-- `heures_forfait` : le premier reste un repli pour les vagues déjà en prod non encore scindées
-- en classes (migration additive, adoption progressive promotion par promotion), le second
-- reste une propriété de la promotion — le forfait ne dépend pas du niveau de l'élève.

create type public.niveau_classe as enum ('beginner', 'intermediate', 'advanced');
create type public.creneau_classe as enum ('matin', 'midi', 'soir');

create table public.cohort_classes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  niveau public.niveau_classe not null,
  -- Plusieurs classes du MÊME niveau doivent pouvoir coexister dans une promotion — règle
  -- client des 3 à 7 apprenants : au-delà de 7, il faut une 2e classe du même niveau. Pas de
  -- contrainte unique(cohort_id, niveau).
  nom text,
  creneau public.creneau_classe not null default 'soir',
  teacher_id uuid references public.profiles(id),
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index cohort_classes_cohorte on public.cohort_classes (cohort_id);

alter table public.sessions
  add column cohort_class_id uuid references public.cohort_classes(id) on delete set null;

create index sessions_classe on public.sessions (cohort_class_id, debut);

-- Inscription à la promotion ET à sa classe en une seule ligne, pour ne jamais désynchroniser
-- "être dans la promotion" (qui déclenche déjà le forfait, trigger 0071) et "être dans une
-- classe de cette promotion". Nullable : une vague legacy sans classe, ou un étudiant en
-- attente d'affectation à une classe, reste correctement représenté.
alter table public.cohort_enrollments
  add column cohort_class_id uuid references public.cohort_classes(id) on delete set null;

create index cohort_enrollments_classe on public.cohort_enrollments (cohort_class_id);

-- Créneaux horaires réglables au niveau établissement (7h/12h/19h par défaut) — même logique
-- que heures_forfait_collectif (0069) : une valeur de référence pour tout l'établissement,
-- qu'une classe choisit parmi les 3 (matin/midi/soir) plutôt que par promotion.
alter table public.etablissements
  add column creneau_matin time not null default '07:00',
  add column creneau_midi  time not null default '12:00',
  add column creneau_soir  time not null default '19:00';

-- Capacité max (7) : demande client « blocage + suggestion » plutôt qu'un dédoublement
-- automatique de la classe. En trigger et pas seulement côté app car AssignerVague.tsx et
-- CohortesAdmin.tsx écrivent directement dans cohort_enrollments via supabase-js (RLS), sans
-- passer par un endpoint serveur : la garde doit vivre en base pour être infranchissable.
create or replace function public.verifier_capacite_classe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compte integer;
begin
  if new.cohort_class_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.cohort_class_id is not distinct from new.cohort_class_id then
    return new;
  end if;
  select count(*) into v_compte
    from public.cohort_enrollments
   where cohort_class_id = new.cohort_class_id
     and student_id <> new.student_id;
  if v_compte >= 7 then
    raise exception 'Cette classe compte déjà 7 élèves, le maximum autorisé. Créez une seconde classe de ce niveau pour accueillir davantage d''élèves.';
  end if;
  return new;
end;
$$;

create trigger cohort_enrollments_capacite_classe
  before insert or update of cohort_class_id on public.cohort_enrollments
  for each row
  execute function public.verifier_capacite_classe();

-- Garde-fou changement de promotion — demande client : un étudiant ne peut changer de
-- promotion que s'il n'a encore consommé AUCUNE heure de son forfait collectif dans sa
-- promotion actuelle. `packages` n'a pas de colonne `heures_consommees` et `hour_ledger` n'a
-- pas de `package_id` (voir 0071/0012) : le signal le plus fiable est l'existence d'un débit
-- `hour_ledger` dont la séance est rattachée à sa promotion actuelle via `sessions.cohort_id`
-- (toujours renseigné, y compris pour une séance de classe — voir creerSeance.ts).
create or replace function public.etudiant_a_consomme_heures_promotion(p_student_id uuid, p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.hour_ledger hl
    join public.sessions s on s.id = hl.session_id
    where hl.student_id = p_student_id
      and hl.type_ecriture = 'debit_etudiant'
      and s.cohort_id = p_cohort_id
  );
$$;

create or replace function public.verifier_pas_de_consommation_avant_changement_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.cohort_id is distinct from new.cohort_id
     and public.etudiant_a_consomme_heures_promotion(old.student_id, old.cohort_id) then
    raise exception 'Cet élève a déjà suivi des séances décomptées de son forfait dans sa promotion actuelle : le changement de promotion n''est plus possible.';
  end if;
  return new;
end;
$$;

create trigger cohort_enrollments_garde_changement_promotion
  before update of cohort_id on public.cohort_enrollments
  for each row
  execute function public.verifier_pas_de_consommation_avant_changement_promotion();

-- Fonctions security definer plutôt que des sous-requêtes dans les policies : même parade que
-- 0069 (cohorts/cohort_enrollments se référencent mutuellement).
create or replace function public.est_professeur_de_classe(p_cohort_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohort_classes cc
    where cc.id = p_cohort_class_id and cc.teacher_id = auth.uid()
  );
$$;

create or replace function public.est_membre_de_classe(p_cohort_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohort_enrollments ce
    where ce.cohort_class_id = p_cohort_class_id and ce.student_id = auth.uid()
  );
$$;

create or replace function public.est_professeur_dune_classe_de_la_promotion(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohort_classes cc
    where cc.cohort_id = p_cohort_id and cc.teacher_id = auth.uid()
  );
$$;

create or replace function public.est_dans_une_classe_du_professeur(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cohort_enrollments ce
    join public.cohort_classes cc on cc.id = ce.cohort_class_id
    where ce.student_id = p_student_id and cc.teacher_id = auth.uid()
  );
$$;

alter table public.cohort_classes enable row level security;

create policy "cohort_classes_admin_all"
  on public.cohort_classes for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Le professeur d'une classe la lit, comme pour une vague entière (0069) : sans ça il ne peut
-- pas afficher son groupe ni établir son planning prévisionnel.
create policy "cohort_classes_teacher_select"
  on public.cohort_classes for select
  to authenticated
  using (teacher_id = auth.uid());

create policy "cohort_classes_student_select"
  on public.cohort_classes for select
  to authenticated
  using (public.est_membre_de_classe(id));

create policy "cohorts_teacher_select_classe"
  on public.cohorts for select
  to authenticated
  using (public.est_professeur_dune_classe_de_la_promotion(id));

create policy "cohort_enrollments_teacher_select_classe"
  on public.cohort_enrollments for select
  to authenticated
  using (public.est_professeur_de_classe(cohort_class_id));

create policy "profiles_teacher_select_classe"
  on public.profiles for select
  to authenticated
  using (public.est_dans_une_classe_du_professeur(profiles.id));

-- Correction indispensable : sans ça, une séance de classe (cohort_id TOUJOURS renseigné,
-- même pour une séance de classe) resterait visible par TOUS les membres de la promotion via
-- l'ancienne policy 0069 (est_membre_de_vague ne regarde que cohort_id, pas la classe) — un
-- élève de la classe Beginner verrait alors le planning de la classe Advanced. Les séances
-- legacy (cohort_class_id null, vagues non scindées en classes) gardent l'ancien comportement.
drop policy if exists "sessions_student_select_vague" on public.sessions;

create policy "sessions_student_select_vague"
  on public.sessions for select
  to authenticated
  using (
    cohort_id is not null
    and public.est_membre_de_vague(cohort_id)
    and (cohort_class_id is null or public.est_membre_de_classe(cohort_class_id))
  );
