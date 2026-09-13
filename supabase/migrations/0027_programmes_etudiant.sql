-- Programmes étudiant (individuel/duo/collectif) et vagues pour le collectif — Phase 1 du
-- chantier "Hari Online Club" (2026-09-13).

-- Réutilise l'enum type_programme_prospect (0024) plutôt que d'en créer un identique : un
-- forfait individuel/duo porte désormais explicitement son programme. Le collectif, lui,
-- n'a pas de forfait — un étudiant collectif est identifié par sa présence dans
-- cohort_enrollments (plus bas), pas par une colonne supplémentaire ici.
alter table public.packages
  add column type_programme public.type_programme_prospect not null default 'individuel';

-- Informations personnelles éditables demandées côté admin (étudiant ET professeur).
alter table public.profiles
  add column telephone text,
  add column adresse text;

create type public.statut_cohorte as enum ('a_venir', 'en_cours', 'terminee');

-- Une "vague" collectif : dates de session fixes, paramétrée par l'admin depuis son espace.
create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  nom text not null,
  langue text,
  date_debut date not null,
  date_fin date not null,
  capacite_max int,
  statut public.statut_cohorte not null default 'a_venir',
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (date_fin >= date_debut)
);

alter table public.cohorts enable row level security;

create policy "cohorts_admin_all"
  on public.cohorts for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Inscription d'un étudiant à une vague (= sa "classe" pour le collectif).
create table public.cohort_enrollments (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (cohort_id, student_id)
);

alter table public.cohort_enrollments enable row level security;

create policy "cohort_enrollments_admin_all"
  on public.cohort_enrollments for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "cohort_enrollments_student_select"
  on public.cohort_enrollments for select
  to authenticated
  using (student_id = auth.uid());

-- Un étudiant doit pouvoir lire les dates de SA vague — jointure vers cohort_enrollments, créée
-- juste au-dessus dans ce même fichier.
create policy "cohorts_student_select"
  on public.cohorts for select
  to authenticated
  using (
    exists (
      select 1 from public.cohort_enrollments ce
      where ce.cohort_id = cohorts.id and ce.student_id = auth.uid()
    )
  );
