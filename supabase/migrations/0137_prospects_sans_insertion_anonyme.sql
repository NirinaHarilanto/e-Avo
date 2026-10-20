-- Revue de sécurité du 2026-10-20, suite de 0136.
--
-- 1. `prospects_insert_public` (0005) laissait N'IMPORTE QUEL visiteur — sans compte, avec la seule
--    clé publique embarquée dans le site — insérer directement une ligne `prospects` avec les
--    valeurs de son choix : statut « etudiant », lien DUO vers un vrai dossier, tarif, établissement.
--    Cela contournait tout ce que les routes publiques imposent (limite de débit, garde
--    d'homonymie, champs bornés) et pouvait gonfler ou fausser le pipeline. La policy ne sert plus
--    à rien : la page publique crée ses prospects par api/prospects/reserver.ts et
--    inscrire-test.ts (clé de service), l'admin par sa propre policy `prospects_admin_all`.
--
-- 2. `creer_dossiers_par_defaut` (0059) est `security definer` et restait exécutable par tout
--    compte via l'API (droit EXECUTE par défaut de PostgreSQL), pour n'importe quel profil. Sans
--    gravité (elle ne crée que les trois dossiers par défaut, de façon idempotente), mais elle
--    n'est appelée que par ses déclencheurs, qui s'exécutent avec les droits du propriétaire :
--    retirer l'accès direct ne change rien à leur fonctionnement.

begin;

drop policy if exists "prospects_insert_public" on public.prospects;

revoke execute on function public.creer_dossiers_par_defaut(uuid) from public, anon, authenticated;

commit;
