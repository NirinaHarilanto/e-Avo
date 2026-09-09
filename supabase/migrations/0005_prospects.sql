-- Pipeline commercial : Prospect -> Diagnostic planifié -> Diagnostic fait -> Étudiant.
create type public.statut_prospect as enum (
  'prospect', 'diagnostic_planifie', 'diagnostic_fait', 'etudiant'
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  statut public.statut_prospect not null default 'prospect',
  nom text not null,
  prenom text not null,
  email text not null,
  telephone text,
  langue_visee text,
  objectif text,
  disponibilites text,
  created_at timestamptz not null default now()
);

alter table public.prospects enable row level security;

-- Un visiteur anonyme peut créer un prospect depuis la landing page publique de
-- l'établissement (formulaire de capture), mais ne peut ensuite ni lire ni modifier
-- aucune ligne — la conversion se fait uniquement côté admin/API.
create policy "prospects_insert_public"
  on public.prospects for insert
  to anon, authenticated
  with check (true);

create policy "prospects_admin_all"
  on public.prospects for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());
