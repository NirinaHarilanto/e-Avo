-- Espace "Admin plateforme" : un niveau d'administration AU-DESSUS des établissements
-- (gestion des établissements eux-mêmes, gestion des accès admin de chaque établissement).
--
-- Volontairement un concept SÉPARÉ de profiles.role plutôt qu'une 4e valeur de l'enum
-- role_profil : ajouter une valeur transverse obligerait à rendre profiles.etablissement_id
-- nullable, risquant une régression sur current_etablissement_id() (cœur du système RLS déjà
-- corrigé deux fois — migrations 0016/0017). Un platform admin garde quand même une ligne
-- profiles normale (créée par handle_new_user, migration 0002, qui exige toujours un
-- etablissement_id dans les métadonnées) : ce rattachement établissement/rôle est sans
-- incidence, son pouvoir réel vient uniquement de sa présence dans la table ci-dessous.

create table public.platform_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nom text,
  prenom text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Permet au layout front de vérifier son propre statut. Aucune policy insert/update/delete :
-- la table n'est écrite que par service_role (comme hour_ledger) — pas de flux "un platform
-- admin en invite un autre" dans ce lot, limitation assumée.
create policy "platform_admins_self_select"
  on public.platform_admins for select
  to authenticated
  using (id = auth.uid());

-- Fonction transverse, même principe que current_etablissement_id()/is_admin_etablissement()
-- (0003) : security definer pour ne jamais risquer de récursion RLS sur platform_admins.
create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins where id = auth.uid()
  )
$$;

-- Complète etablissements_admin_update (0004), qui reste scopée au seul établissement de
-- l'admin appelant. Pas de policy delete : cohérent avec l'absence de suppression côté client
-- ailleurs sur les tables "tenant" de ce schéma.
create policy "etablissements_plateforme_insert"
  on public.etablissements for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "etablissements_plateforme_update"
  on public.etablissements for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Le platform admin doit pouvoir lister qui est admin_etablissement de quel établissement —
-- policy volontairement sans filtre de rôle (le filtrage se fait côté requête), mais toujours
-- pas de policy update : la promotion de rôle reste verrouillée par le trigger 0015 et ne
-- passe que par api/plateforme/inviter-admin-etablissement.ts (clé service_role).
create policy "profiles_plateforme_select"
  on public.profiles for select
  to authenticated
  using (public.is_platform_admin());
