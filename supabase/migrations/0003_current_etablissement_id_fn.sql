-- Fonctions utilitaires pour les policies RLS, ownées par `postgres` (rôle avec BYPASSRLS
-- sur Supabase) pour que leurs requêtes internes sur `profiles` n'entrent jamais dans une
-- évaluation RLS récursive. C'est un point à vérifier explicitement après application de
-- cette migration : ne jamais laisser un ALTER FUNCTION ... OWNER TO changer ce propriétaire.
--
-- Le piège évité ici : écrire l'équivalent en `exists (select ... from profiles ...)`
-- directement dans une policy sur `profiles` déclencherait une réévaluation RLS de cette
-- même policy pour la ligne interne, potentiellement récursive. Passer par une fonction
-- security definer contourne le problème à la racine. Même principe que
-- `current_cabinet_id()` et `is_admin()` chez Dentalis, adapté au multi-tenant e-Avo (ici,
-- l'établissement est lu depuis `profiles.etablissement_id`, pas depuis une colonne
-- `owner_id` sur la table tenant — un établissement n'est pas "possédé" par un seul
-- utilisateur).
create or replace function public.current_etablissement_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select etablissement_id from public.profiles where id = auth.uid()
$$;

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
  )
$$;
