-- Section « Profil HOC » de l'espace admin — demande client du 2026-10-05 : les informations
-- légales/administratives de l'établissement (directrice, adresse, NIF, STAT…), modifiables,
-- réutilisées sur les factures, devis, reçus et contrats qui mentionnent Hari Online Club.
--
-- Champs « publics » directement sur `etablissements`, dont la policy de lecture
-- (`etablissements_lecture_publique`, 0001 : select à `anon` ET `authenticated`, sans filtre de
-- ligne) expose déjà `nom`/`specialite` à n'importe qui visitant la page vitrine. Adresse,
-- téléphone, e-mail, site web, nom de la directrice, NIF et STAT sont du même ordre : des
-- informations qu'une entreprise affiche normalement sur sa page de contact et sur ses factures,
-- donc sans conséquence à exposer publiquement de la même façon.
alter table public.etablissements
  add column directrice text,
  add column adresse text,
  add column telephone text,
  add column email text,
  add column site_web text,
  add column nif text,
  add column stat text;

-- Le CIN de la directrice, lui, est une pièce d'identité PERSONNELLE — jamais au même endroit.
-- `etablissements_admin_update` (0004) ne filtre que par ligne (RLS), pas par colonne : il
-- n'existe aucun moyen, avec une policy RLS classique, de laisser `nif`/`adresse` publics tout en
-- réservant une seule colonne à l'admin — Postgres ne fait pas de RLS par colonne. D'où une table
-- séparée, strictement réservée à l'admin de l'établissement (ni l'anonyme de la vitrine, ni
-- l'étudiant/professeur qui consulte sa propre facture n'en ont besoin : le CIN n'apparaît sur
-- aucun document imprimé, voir src/lib/contrats.ts).
create table public.etablissement_identite_privee (
  etablissement_id uuid primary key references public.etablissements(id) on delete cascade,
  cin_directrice text,
  updated_at timestamptz not null default now()
);

alter table public.etablissement_identite_privee enable row level security;

create policy "etablissement_identite_privee_admin_all"
  on public.etablissement_identite_privee for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create trigger etablissement_identite_privee_touch
  before update on public.etablissement_identite_privee
  for each row execute function public.horodater_updated_at();
