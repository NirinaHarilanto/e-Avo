-- Contrats types et contrats instanciés — Phase 4 (suite). Décision actée avec le client
-- (2026-09-10) : génération + suivi manuel, pas de signature électronique tierce pour cette
-- version — un contrat signé scanné peut être rattaché comme document (table `documents`,
-- migration 0018).

create type public.statut_contrat as enum ('brouillon', 'envoye', 'signe', 'resilie');

-- Modèles internes à l'admin : jamais exposés tels quels au signataire (les variables sont
-- substituées côté client au moment de la génération d'un contrat instancié ci-dessous).
create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  nom text not null,
  public_cible public.role_profil not null check (public_cible in ('etudiant', 'professeur')),
  corps_template text not null,
  variables_disponibles jsonb not null default '[]',
  actif boolean not null default true,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.contract_templates enable row level security;

create policy "contract_templates_admin_all"
  on public.contract_templates for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- `corps_genere` est un instantané figé au moment de la génération (substitution des
-- variables déjà effectuée côté client) : il ne doit JAMAIS être recalculé si le modèle
-- source change ensuite, pour que l'historique des contrats déjà émis reste exact.
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  template_id uuid references public.contract_templates(id) on delete set null,
  destinataire_profile_id uuid not null references public.profiles(id),
  destinataire_role public.role_profil not null check (destinataire_role in ('etudiant', 'professeur')),
  titre text not null,
  corps_genere text not null,
  variables_valeurs jsonb not null default '{}',
  statut public.statut_contrat not null default 'brouillon',
  date_envoi date,
  date_signature date,
  date_resiliation date,
  document_id uuid references public.documents(id),
  notes text,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.contracts enable row level security;

-- Contrairement aux tables financières (0019/0020), la suppression cliente n'est pas
-- restreinte ici : aucune contrainte de traçabilité comptable ne s'applique à un contrat
-- (un brouillon erroné peut être retiré directement par l'admin).
create policy "contracts_admin_all"
  on public.contracts for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "contracts_destinataire_select"
  on public.contracts for select
  to authenticated
  using (destinataire_profile_id = auth.uid());
