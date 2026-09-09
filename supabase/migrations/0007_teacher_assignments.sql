-- Historique des périodes prof <-> élève. Une ligne = une période d'enseignement continue
-- avec un professeur donné. C'est la table clé de la traçabilité exigée : un changement de
-- professeur ferme une ligne (date_fin) et en ouvre une nouvelle, sans jamais réécrire
-- l'historique.
create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  student_id uuid not null references public.profiles(id),
  teacher_id uuid not null references public.profiles(id),
  langue text,
  date_debut date not null,
  date_fin date,
  motif_changement text,
  created_at timestamptz not null default now()
);

alter table public.teacher_assignments enable row level security;

create policy "teacher_assignments_admin_all"
  on public.teacher_assignments for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "teacher_assignments_student_select"
  on public.teacher_assignments for select
  to authenticated
  using (student_id = auth.uid());

create policy "teacher_assignments_teacher_select"
  on public.teacher_assignments for select
  to authenticated
  using (teacher_id = auth.uid());
