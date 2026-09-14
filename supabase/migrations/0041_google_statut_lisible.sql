-- Corrige la vue de statut créée en 0040, qui n'aurait jamais rien renvoyé.
--
-- `security_invoker = true` fait évaluer la table sous-jacente avec les droits de l'appelant :
-- or `google_integrations` a RLS active et AUCUNE policy, délibérément (le jeton de
-- rafraîchissement ne doit être lisible que par la clé service_role). L'admin voyait donc
-- toujours zéro ligne, et l'écran des paramètres aurait affiché « aucun compte connecté » même
-- juste après une connexion réussie.
--
-- La vue est donc recréée SANS security_invoker : elle s'exécute avec les droits de son
-- propriétaire (postgres, BYPASSRLS), et c'est sa propre clause WHERE qui porte la sécurité —
-- exactement le rôle d'une vue-fenêtre sur une table que personne ne peut lire directement.
-- `auth.uid()`, lu depuis les claims JWT de la session, continue d'identifier l'appelant réel
-- quel que soit le propriétaire de la vue : les deux conditions ci-dessous restent donc bien
-- évaluées pour lui, et aucune colonne sensible n'est exposée.
drop view if exists public.google_integration_statut;

create view public.google_integration_statut as
select
  gi.etablissement_id,
  gi.google_email,
  gi.connecte_le,
  gi.derniere_erreur
from public.google_integrations gi
where gi.etablissement_id = public.current_etablissement_id()
  and public.is_admin_etablissement();

grant select on public.google_integration_statut to authenticated;
