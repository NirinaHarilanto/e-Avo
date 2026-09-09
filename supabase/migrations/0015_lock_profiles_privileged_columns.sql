-- Durcissement : `profiles_self_update` (0004) autorise `id = auth.uid()` sans restreindre
-- les colonnes modifiables — Postgres RLS ne filtre que les LIGNES, pas les colonnes. N'importe
-- quel utilisateur authentifié peut donc aujourd'hui s'auto-promouvoir en exécutant
-- `update profiles set role = 'admin_etablissement' where id = auth.uid()`, ou changer son
-- etablissement_id/status. C'est exactement l'auto-promotion que le trigger `handle_new_user`
-- (0002) empêchait à l'inscription, réintroduite par la voie de la mise à jour.
--
-- Fonction `security definer` (bypass RLS via son propriétaire postgres) qui bloque toute
-- modification de role/etablissement_id/status quand l'appelant n'est ni `service_role` ni
-- `postgres` — auth.role() renvoie le rôle Postgres associé au JWT de la requête PostgREST.
create function public.empecher_promotion_profil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() not in ('service_role', 'postgres') then
    if new.role is distinct from old.role
      or new.etablissement_id is distinct from old.etablissement_id
      or new.status is distinct from old.status
    then
      raise exception 'Modification de role/etablissement_id/status réservée au backend (service_role).';
    end if;
  end if;
  return new;
end;
$$;

create trigger empecher_promotion_profil_trigger
  before update on public.profiles
  for each row execute function public.empecher_promotion_profil();
