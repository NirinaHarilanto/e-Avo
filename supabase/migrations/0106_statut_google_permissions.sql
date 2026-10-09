-- Expose les permissions réellement accordées par Google dans la vue de statut, pour que l'écran
-- Paramètres puisse dire si l'intégration fonctionne — et pas seulement si un compte est branché.
--
-- Trouvé le 2026-10-09 sur la base de production : après la reconnexion du compte
-- `admin@harionlineclub.com`, `google_integrations.scope` valait
-- « https://www.googleapis.com/auth/userinfo.email openid », SANS `calendar.events`. L'écran
-- affichait pourtant « Compte Google connecté. Les prochaines séances seront inscrites à
-- l'agenda », alors qu'aucune ne pouvait l'être : Google renvoie les permissions effectivement
-- cochées, et celle de l'agenda, sensible, est présentée dans une case à part que l'utilisateur
-- doit valider explicitement. Oubliée, l'intégration s'installe muette et inerte.
--
-- La colonne `scope` est déjà stockée (0040) ; elle n'était simplement jamais relue. Elle ne
-- contient aucun secret — des URL de permissions Google — contrairement au jeton de
-- rafraîchissement, qui reste hors de cette vue.
--
-- Recréée sans `security_invoker`, comme en 0041 : `google_integrations` a RLS active et aucune
-- policy, c'est la clause WHERE de la vue qui porte la sécurité.
drop view if exists public.google_integration_statut;

create view public.google_integration_statut as
select
  gi.etablissement_id,
  gi.google_email,
  gi.connecte_le,
  gi.derniere_erreur,
  gi.scope
from public.google_integrations gi
where gi.etablissement_id = public.current_etablissement_id()
  and public.is_admin_etablissement();

grant select on public.google_integration_statut to authenticated;
