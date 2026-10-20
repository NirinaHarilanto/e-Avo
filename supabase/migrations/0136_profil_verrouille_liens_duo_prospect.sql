-- Revue de sécurité du 2026-10-20. `profiles_self_update` (0004) laisse chaque compte modifier
-- n'importe quelle colonne de SA ligne ; `empecher_promotion_profil` ne bloquait que role,
-- etablissement_id, status, les taux horaires et statut_integration.
--
-- Deux colonnes restaient libres alors qu'elles OUVRENT des droits de lecture :
-- - `duo_partenaire_id` : `est_partenaire_duo()` (0054) donne au secondaire d'un binôme la
--   lecture du forfait, des séances, des heures, des paiements, des factures, des contrats et du
--   niveau de la personne pointée. Un étudiant qui y écrivait l'id d'un autre élève (visible dans
--   `annuaire_etablissement`) lisait tout son dossier financier et pédagogique.
-- - `prospect_id` : rattache le profil au dossier prospect (diagnostic, paiements d'avant
--   conversion) — même nature de lien, même règle.
--
-- Les deux ne sont posées que par le backend (api/admin/convert-prospect.ts et voisines, en
-- service_role) ; aucun écran ne les modifie depuis le navigateur. Elles rejoignent donc la
-- première garde, réservée au service_role. Fonction recréée à l'identique pour le reste.

begin;

create or replace function public.empecher_promotion_profil()
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
      or new.duo_partenaire_id is distinct from old.duo_partenaire_id
      or new.prospect_id is distinct from old.prospect_id
    then
      raise exception 'Modification de role/etablissement_id/status/duo_partenaire_id/prospect_id réservée au backend (service_role).';
    end if;
    if (
        new.taux_horaire_individuel is distinct from old.taux_horaire_individuel
        or new.taux_horaire_duo is distinct from old.taux_horaire_duo
        or new.taux_horaire_collectif is distinct from old.taux_horaire_collectif
        or new.taux_horaire_corporate is distinct from old.taux_horaire_corporate
        or new.taux_horaire_chat_chill is distinct from old.taux_horaire_chat_chill
      )
      and auth.uid() = old.id and not public.is_admin_etablissement()
    then
      raise exception 'Modification du taux horaire réservée à un administrateur.';
    end if;
    if new.statut_integration is distinct from old.statut_integration and not public.is_admin_etablissement() then
      raise exception 'Validation de l''intégration réservée à un administrateur.';
    end if;
  end if;
  return new;
end;
$$;

commit;
