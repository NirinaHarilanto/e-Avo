-- Lien Google Meet automatique sur les créneaux de test oral, et rattachement de la vague à la
-- conversion d'un prospect — demande client du 2026-09-21 (suite immédiate).
--
-- Même mécanique que les séances de cours (video_sessions.google_event_id, migration 0040) :
-- l'identifiant de l'événement Calendar doit être conservé pour pouvoir déplacer ou supprimer
-- l'événement plus tard (créneau reprogrammé/supprimé), le lien Meet lui-même ne change pas.
alter table public.creneaux_test_positionnement
  add column google_event_id text;
