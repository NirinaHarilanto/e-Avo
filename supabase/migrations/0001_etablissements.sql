-- Table des établissements clients de la plateforme (multi-tenant : plusieurs lignes actives
-- en permanence, à la différence du modèle Dentalis où `cabinet_info` n'a qu'une ligne par
-- praticien). Les champs de branding sont volontairement lisibles publiquement : ils
-- alimentent le sélecteur d'établissement et les landing pages de prospection, consultées
-- avant toute authentification.
create table public.etablissements (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  slug text not null unique,
  specialite text,
  couleur_accent text,
  logo_url text,
  created_at timestamptz not null default now()
);

alter table public.etablissements enable row level security;

create policy "etablissements_lecture_publique"
  on public.etablissements
  for select
  to anon, authenticated
  using (true);

-- Pas de policy d'écriture ici : la création d'un nouvel établissement reste une opération
-- manuelle (clé service_role) tant qu'il n'existe pas de parcours d'onboarding dédié. La
-- policy de mise à jour par l'admin de l'établissement est ajoutée dans 0004, une fois
-- current_etablissement_id() disponible (elle en dépend).
