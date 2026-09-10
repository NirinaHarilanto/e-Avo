-- Grille tarifaire affichée sur la landing (section "Tarifs", même style visuel que
-- "Programmes"), paramétrable depuis l'espace admin sans toucher au code. Une ligne par
-- brochure/formule, rattachée à un des 3 programmes existants (type_programme_prospect, 0024).
create table public.tarifs (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  type_programme public.type_programme_prospect not null,
  titre text not null,
  prix numeric(10, 2) not null,
  unite text not null default '/heure',
  description text,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tarifs enable row level security;

-- Lecture publique : la landing (visiteur anonyme) doit pouvoir afficher les tarifs.
create policy "tarifs_public_select"
  on public.tarifs for select
  to anon, authenticated
  using (true);

create policy "tarifs_admin_all"
  on public.tarifs for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());
