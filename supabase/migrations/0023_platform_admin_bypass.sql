-- Un compte garde un rôle unique (profiles.role) — SAUF l'administrateur plateforme
-- (public.platform_admins, 0022), seul autorisé à cumuler les 3 espaces (élève/professeur/
-- admin) de son propre établissement. Plutôt qu'une table de rôles multiples pour tout le
-- monde, on redéfinit le seul point d'entrée déjà utilisé par ~45 policies RLS
-- (is_admin_etablissement, 0003/0016) pour qu'il s'active aussi pour un platform admin — la
-- portée reste bornée à son établissement via current_etablissement_id(), déjà combiné à
-- is_admin_etablissement() dans chaque policy existante (ex. "etablissement_id =
-- current_etablissement_id() and is_admin_etablissement()").
create or replace function public.is_admin_etablissement()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role = 'admin_etablissement' from public.profiles where id = auth.uid()),
    false
  ) or public.is_platform_admin()
$$;
