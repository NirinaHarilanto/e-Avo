-- Notifications en temps réel (demande client du 2026-09-29) : jusqu'ici, la cloche de
-- notifications (useNotifications.ts) ne se chargeait qu'une fois au montage, jamais
-- réinterrogée — il fallait recharger la page pour voir une nouvelle notification. La table
-- `notifications` (0028) a déjà tout ce qu'il faut pour du Supabase Realtime : une policy SELECT
-- compatible telle quelle (`destinataire_profile_id = auth.uid()`, Realtime respecte RLS), et un
-- point d'entrée serveur unique déjà appelé à chaque événement métier (creerNotification(),
-- api/_lib/notifications.ts). Il ne manquait que l'ajout à la publication `supabase_realtime` :
-- sans cette ligne, aucun événement n'est jamais diffusé aux abonnés, quelle que soit la policy.
alter publication supabase_realtime add table public.notifications;
