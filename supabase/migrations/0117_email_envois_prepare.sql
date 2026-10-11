-- Les modèles d'e-mail de l'espace admin n'envoient plus par Resend : ils ouvrent le message
-- préparé dans la messagerie de l'établissement (Gmail), et c'est l'admin qui clique « Envoyer »
-- — demande client du 2026-10-11. Les e-mails transactionnels (mot de passe oublié, confirmations
-- de rendez-vous, relances) continuent, eux, de partir par Resend : rien ne change pour eux.
--
-- Conséquence directe sur le journal : l'application ne peut plus savoir si le message est
-- réellement parti. Elle sait qu'elle l'a PRÉPARÉ, rien de plus — l'admin peut très bien fermer
-- l'onglet Gmail sans rien envoyer. Continuer à écrire 'envoye' serait un mensonge, et
-- « Derniers envois » afficherait comme parti un message qui ne l'est pas.
--
-- D'où ce troisième statut. Les lignes existantes ne bougent pas : un 'envoye' d'avant ce
-- changement reste vrai (il est bien parti par Resend), et 'echec' garde son sens pour ces
-- mêmes lignes d'historique.
alter table public.email_envois
  drop constraint if exists email_envois_statut_check;

alter table public.email_envois
  add constraint email_envois_statut_check
  check (statut in ('brouillon', 'envoye', 'echec', 'prepare'));

comment on column public.email_envois.statut is
  'brouillon : mis de côté, pas encore traité. prepare : ouvert dans la messagerie de l''admin, qui l''envoie lui-même (0117) — l''application ne peut pas confirmer le départ. envoye/echec : résultat d''un envoi automatique par Resend (historique, et e-mails transactionnels).';
