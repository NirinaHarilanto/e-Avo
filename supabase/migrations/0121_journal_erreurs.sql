-- Observabilité : journal des erreurs survenues chez les utilisateurs — revue du 2026-10-11.
--
-- Angle mort constaté pendant cette revue : l'application n'avait AUCUNE capture d'erreur côté
-- navigateur (ni ErrorBoundary React, ni `window.onerror`, ni `unhandledrejection`). Un plantage
-- de rendu laissait donc une page blanche, sans la moindre trace — et c'est bien ce qui s'est
-- passé pour le blocage « Chargement… » après inactivité : seul le client l'a vu, jamais
-- l'application. Un bug qu'on ne voit pas est un bug qu'on ne corrige pas.
--
-- Journal en base plutôt qu'un service tiers (Sentry, Datadog) : même raisonnement que pour la
-- limitation de débit en 0101 — cohérent avec un projet qui n'utilise que Supabase, sans nouveau
-- compte ni abonnement à faire souscrire au client. On vise le strict nécessaire pour diagnostiquer
-- (quoi, où, qui, quand), pas une plateforme d'APM.
create table if not exists public.journal_erreurs (
  id uuid primary key default gen_random_uuid(),
  -- Nullable : une erreur peut survenir sur la vitrine publique, avant toute connexion.
  etablissement_id uuid references public.etablissements (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  -- D'où vient l'erreur : 'rendu' (ErrorBoundary), 'promesse' (unhandledrejection),
  -- 'navigateur' (window.onerror). Texte libre plutôt qu'un enum : la liste s'allongera au fil
  -- des points de capture, et une valeur inconnue ne doit jamais faire échouer un signalement.
  source text not null,
  message text not null,
  pile text,
  -- Chemin applicatif, jamais l'URL complète : les identifiants de route (/admin/etudiants/<uuid>)
  -- suffisent à situer l'erreur sans accumuler de données personnelles.
  chemin text,
  navigateur text,
  created_at timestamptz not null default now()
);

create index if not exists idx_journal_erreurs_etablissement_date
  on public.journal_erreurs (etablissement_id, created_at desc);

alter table public.journal_erreurs enable row level security;

-- Écriture ouverte à toute personne connectée, pour son propre établissement : c'est le poste de
-- l'utilisateur qui signale sa propre erreur, il n'y a pas d'autre moment où l'enregistrer. Aucune
-- lecture ne lui est ouverte en échange — un journal d'erreurs peut contenir des messages
-- techniques révélant la structure interne, il n'a rien à faire sous les yeux d'un élève.
drop policy if exists journal_erreurs_insert_connecte on public.journal_erreurs;
create policy journal_erreurs_insert_connecte on public.journal_erreurs
  for insert to authenticated
  with check (
    etablissement_id is not distinct from public.current_etablissement_id()
    and (profile_id is null or profile_id = auth.uid())
  );

-- Lecture réservée à l'administrateur de l'établissement concerné : c'est lui qui exploite le
-- journal depuis Paramètres.
drop policy if exists journal_erreurs_select_admin on public.journal_erreurs;
create policy journal_erreurs_select_admin on public.journal_erreurs
  for select to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

comment on table public.journal_erreurs is
  'Erreurs survenues chez les utilisateurs (rendu React, promesses rejetées, erreurs navigateur). '
  'Écrit par le poste de l''utilisateur, lu par l''administrateur de son établissement.';

-- Purge : un journal qui grossit sans fin finit par coûter plus qu'il ne rend. Fonction appelée
-- au besoin (ou par un cron Supabase) plutôt qu'un déclencheur à chaque insertion, qui ferait
-- payer le ménage à l'utilisateur en train de signaler son erreur.
create or replace function public.purger_journal_erreurs(p_jours integer default 30)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supprimees integer;
begin
  delete from public.journal_erreurs
  where created_at < now() - make_interval(days => p_jours);
  get diagnostics v_supprimees = row_count;
  return v_supprimees;
end;
$$;

revoke all on function public.purger_journal_erreurs(integer) from public, anon, authenticated;
