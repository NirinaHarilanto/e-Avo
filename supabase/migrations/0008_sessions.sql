create type public.type_seance as enum ('individuel', 'collectif');
create type public.statut_seance as enum ('planifiee', 'terminee', 'annulee');

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  teacher_id uuid not null references public.profiles(id),
  type public.type_seance not null,
  debut timestamptz not null,
  duree_minutes integer not null,
  statut public.statut_seance not null default 'planifiee',
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "sessions_admin_all"
  on public.sessions for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "sessions_teacher_all"
  on public.sessions for all
  to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- La policy de lecture élève (via ses inscriptions) est ajoutée en 0009, qui crée
-- session_enrollments dont elle dépend.
