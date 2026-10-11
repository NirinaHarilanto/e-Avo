-- Troisième manière d'adresser un modèle d'e-mail — demande client du 2026-10-11, à la suite du
-- passage par Gmail (0117) : « rajoute un bouton "Envoyer" [...] le message sera envoyé en
-- interne de l'application dans les espaces personnels des destinataires ».
--
-- Ce canal-là ne sort pas de HOC : le message est déposé dans `messages` (0090), et chaque
-- destinataire le trouve dans la section Messages de son espace. C'est le seul des trois canaux
-- dont l'application puisse affirmer qu'il a abouti — elle l'a distribué elle-même.
--
-- D'où un statut distinct plutôt qu'un 'envoye' réutilisé : 'envoye' dit « parti par Resend »
-- (e-mails transactionnels et historique d'avant 0117), 'prepare' dit « ouvert dans Gmail, suite
-- inconnue », 'interne' dit « déposé dans les espaces personnels ». Les trois sont des faits
-- différents, et l'admin qui relit son historique doit pouvoir les distinguer — un message interne
-- n'est jamais arrivé dans la boîte e-mail du destinataire, et le présenter comme « Envoyé » le
-- laisserait croire.
alter table public.email_envois
  drop constraint if exists email_envois_statut_check;

alter table public.email_envois
  add constraint email_envois_statut_check
  check (statut in ('brouillon', 'envoye', 'echec', 'prepare', 'interne'));

comment on column public.email_envois.statut is
  'brouillon : mis de côté, pas encore traité. prepare : ouvert dans la messagerie de l''admin, qui l''envoie lui-même (0117) — l''application ne peut pas confirmer le départ. interne : distribué dans les espaces personnels des destinataires via `messages` (0119), sans sortir de l''application. envoye/echec : résultat d''un envoi automatique par Resend (historique, et e-mails transactionnels).';
