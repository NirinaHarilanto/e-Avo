-- Second professeur ("co-enseignant") sur une classe de niveau d'un cours collectif.
--
-- Demande client du 2026-10-30 : « pour l'attribution de professeur pour une classe en cours
-- collectif, il faut également ajouter la possibilité de rajouter un professeur secondaire comme
-- ce que l'on a fait pour les cours individuels [0138] ». Clarifié avec le client avant écriture :
-- contrairement à l'individuel (1:1, chaque professeur a SES PROPRES séances avec l'élève), une
-- classe collective a des séances COMMUNES à tout le groupe — le même modèle ne se transpose pas
-- tel quel. Rôle retenu : « co-enseignant actif » — le second professeur voit la classe dans son
-- espace (comme le titulaire) et peut planifier ses propres séances pour le groupe. Chaque séance
-- reste attribuée à qui l'a créée (`sessions.teacher_id`, déjà le comportement de
-- `creerSeanceAvecInscriptions`), donc la rémunération suit déjà la bonne personne sans rien
-- changer à ce mécanisme — exactement le même constat que 0138 pour les heures d'un élève.
--
-- `cohort_classes.teacher_id` (0074) reste le TITULAIRE : celui qu'on voit en premier, celui que
-- change « Changer de professeur » dans `AttribuerProfesseurClasse`. Cette table ne porte que les
-- co-professeurs ADDITIONNELS, sur le modèle de `teacher_assignments` (0138).

create table public.cohort_class_teachers (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  cohort_class_id uuid not null references public.cohort_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  assigned_by_profile_id uuid not null references public.profiles(id),
  motif text,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_motif text,
  removed_by_profile_id uuid references public.profiles(id)
);

create index cohort_class_teachers_classe on public.cohort_class_teachers (cohort_class_id);
create index cohort_class_teachers_prof on public.cohort_class_teachers (teacher_id);

-- Jamais deux fois le même co-professeur actif sur la même classe — même parade que
-- `teacher_assignments_un_prof_une_fois_active` (0138).
create unique index cohort_class_teachers_un_prof_une_fois_actif
  on public.cohort_class_teachers (cohort_class_id, teacher_id)
  where removed_at is null;

alter table public.cohort_class_teachers enable row level security;

create policy "cohort_class_teachers_admin_all"
  on public.cohort_class_teachers for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "cohort_class_teachers_teacher_select"
  on public.cohort_class_teachers for select
  to authenticated
  using (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Les trois fonctions security definer qui faisaient reposer TOUT l'accès professeur à une
-- classe sur le seul `cohort_classes.teacher_id` (0074) reconnaissent désormais aussi un
-- co-professeur actif.
-- ---------------------------------------------------------------------------------------------
create or replace function public.est_professeur_de_classe(p_cohort_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cohort_classes cc
    where cc.id = p_cohort_class_id and cc.teacher_id = auth.uid()
  ) or exists (
    select 1 from public.cohort_class_teachers cct
    where cct.cohort_class_id = p_cohort_class_id and cct.teacher_id = auth.uid() and cct.removed_at is null
  );
$$;

create or replace function public.est_professeur_dune_classe_de_la_promotion(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cohort_classes cc
    where cc.cohort_id = p_cohort_id and cc.teacher_id = auth.uid()
  ) or exists (
    select 1
    from public.cohort_class_teachers cct
    join public.cohort_classes cc on cc.id = cct.cohort_class_id
    where cc.cohort_id = p_cohort_id and cct.teacher_id = auth.uid() and cct.removed_at is null
  );
$$;

create or replace function public.est_dans_une_classe_du_professeur(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.cohort_enrollments ce
    join public.cohort_classes cc on cc.id = ce.cohort_class_id
    where ce.student_id = p_student_id and cc.teacher_id = auth.uid()
  ) or exists (
    select 1
    from public.cohort_enrollments ce
    join public.cohort_class_teachers cct on cct.cohort_class_id = ce.cohort_class_id
    where ce.student_id = p_student_id and cct.teacher_id = auth.uid() and cct.removed_at is null
  );
$$;

-- `cohort_classes_teacher_select` (0074) ne passe pas par une fonction : complétée par une
-- policy jumelle plutôt que réécrite — les policies RLS permissives de même type s'additionnent
-- (OR), aucun besoin de toucher à l'existante.
create policy "cohort_classes_coteacher_select"
  on public.cohort_classes for select
  to authenticated
  using (
    exists (
      select 1 from public.cohort_class_teachers cct
      where cct.cohort_class_id = id and cct.teacher_id = auth.uid() and cct.removed_at is null
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Visibilité croisée des séances d'une classe entre son titulaire et son/ses co-professeur(s),
-- en LECTURE SEULE — même principe et même limite que `est_coprofesseur_de_seance` (0138) : la
-- clôture d'une séance écrit la rémunération (`sessions_teacher_all`, 0008, inchangée), elle
-- reste réservée à qui l'a créée. `video_sessions` volontairement exclu de cette liste, pour la
-- même raison qu'en 0138 : le lien de visioconférence est une porte d'entrée, pas de
-- l'historique.
-- ---------------------------------------------------------------------------------------------
create policy "sessions_class_coteacher_select"
  on public.sessions for select
  to authenticated
  using (cohort_class_id is not null and public.est_professeur_de_classe(cohort_class_id));

create policy "session_enrollments_class_coteacher_select"
  on public.session_enrollments for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_enrollments.session_id
        and s.cohort_class_id is not null
        and public.est_professeur_de_classe(s.cohort_class_id)
    )
  );

create policy "session_reports_class_coteacher_select"
  on public.session_reports for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_reports.session_id
        and s.cohort_class_id is not null
        and public.est_professeur_de_classe(s.cohort_class_id)
    )
  );

create policy "session_modifications_class_coteacher_select"
  on public.session_modifications for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_modifications.session_id
        and s.cohort_class_id is not null
        and public.est_professeur_de_classe(s.cohort_class_id)
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Ajouter un co-professeur, sur le modèle de `ajouter_professeur` (0138) : rien à transférer,
-- juste une ligne de plus.
-- ---------------------------------------------------------------------------------------------
create function public.ajouter_professeur_classe(
  p_cohort_class_id uuid,
  p_teacher_id uuid,
  p_motif text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etablissement_id uuid;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_classe_teacher_id uuid;
  v_nouvelle_id uuid;
begin
  if not public.is_admin_etablissement() then
    raise exception 'Seul un administrateur peut attribuer un professeur.' using errcode = '42501';
  end if;

  v_etablissement_id := public.current_etablissement_id();

  select teacher_id into v_classe_teacher_id
  from public.cohort_classes
  where id = p_cohort_class_id and etablissement_id = v_etablissement_id;

  if not found then
    raise exception 'Classe introuvable dans cet établissement.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_teacher_id and etablissement_id = v_etablissement_id and role = 'professeur'
  ) then
    raise exception 'Professeur introuvable dans cet établissement.' using errcode = '42501';
  end if;

  if v_classe_teacher_id = p_teacher_id then
    raise exception 'Ce professeur est déjà le titulaire de cette classe.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.cohort_class_teachers
    where cohort_class_id = p_cohort_class_id and teacher_id = p_teacher_id and removed_at is null
  ) then
    raise exception 'Ce professeur est déjà co-professeur de cette classe.' using errcode = '22023';
  end if;

  insert into public.cohort_class_teachers (
    etablissement_id, cohort_class_id, teacher_id, assigned_by_profile_id, motif
  )
  values (v_etablissement_id, p_cohort_class_id, p_teacher_id, auth.uid(), v_motif)
  returning id into v_nouvelle_id;

  return v_nouvelle_id;
end;
$$;

revoke all on function public.ajouter_professeur_classe(uuid, uuid, text) from public;
grant execute on function public.ajouter_professeur_classe(uuid, uuid, text) to authenticated;

-- Le retrait vit dans api/admin/retirer-professeur-classe.ts, pas ici : mêmes raisons qu'en 0138
-- (annuler une séance retire la réunion Google et prévient les personnes concernées, hors de
-- portée de Postgres). `cohort_class_teachers_admin_all` ci-dessus autorise déjà l'admin à écrire
-- cette table directement avec son propre jeton, comme `teacher_assignments_admin_all`.
