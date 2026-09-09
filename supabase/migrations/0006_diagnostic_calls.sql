create table public.diagnostic_calls (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  prospect_id uuid not null references public.prospects(id),
  mene_par uuid not null references public.profiles(id),
  date_appel timestamptz not null,
  niveau_evalue text,
  notes text,
  rythme_convenu text,
  created_at timestamptz not null default now()
);

alter table public.diagnostic_calls enable row level security;

create policy "diagnostic_calls_admin_all"
  on public.diagnostic_calls for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());
