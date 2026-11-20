-- Le bouton « Envoyer » d'un reçu garde trace de son envoi — signalé par le client le
-- 2026-11-20 : « pourquoi le bouton envoyer est toujours visible alors que les factures sont
-- déjà partagées avec les concernés étudiants ? »
--
-- L'état « envoyée » vivait dans la mémoire de l'onglet (`useState(false)`), et nulle part
-- ailleurs : il repartait à zéro à chaque rechargement, ignorait ce qui avait été envoyé depuis
-- un autre poste, et ne survivait pas à la nuit.
--
-- Pourquoi une colonne de plus, et non `email_envoye_le` (0095) : ce sont DEUX canaux distincts,
-- et les confondre ferait mentir l'un ou l'autre.
--
--   * `email_envoye_le` — l'E-MAIL du modèle 2.3, posté par le cron de 6h. C'est lui que l'élève
--     reçoit dans sa boîte.
--   * `notifie_le` — la NOTIFICATION dans l'application, celle que pose le bouton « Envoyer »
--     (api/admin/notifier.ts → creerNotification, qui insère dans `notifications` et n'envoie
--     aucun e-mail).
--
-- Écrire `email_envoye_le` depuis le bouton aurait empêché le cron d'envoyer l'e-mail, alors que
-- l'élève n'aurait eu qu'une cloche dans l'application — un document annoncé à moitié, et une
-- colonne qui affirme un envoi qui n'a pas eu lieu. Les deux restent donc séparées, et l'écran
-- affiche « Envoyée ✓ » dès que l'une des deux est renseignée : du point de vue de
-- l'administration, la question est « le destinataire a-t-il été prévenu ? », pas « par quel
-- tuyau ».

begin;

alter table public.invoices
  add column if not exists notifie_le timestamptz;

comment on column public.invoices.notifie_le is
  'Horodatage de la notification in-app annonçant ce document à son destinataire, posée par le bouton « Envoyer » de l''écran Facturation (0166). Distincte de `email_envoye_le`, qui trace l''e-mail du cron (modèle 2.3). Null = jamais notifié.';

commit;
