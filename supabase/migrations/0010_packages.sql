create table public.packages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  student_id uuid not null references public.profiles(id),
  total_heures numeric not null,
  echeance date,
  created_at timestamptz not null default now()
);

alter table public.packages enable row level security;

create policy "packages_student_select"
  on public.packages for select
  to authenticated
  using (student_id = auth.uid());

create policy "packages_admin_all"
  on public.packages for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());
