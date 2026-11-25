-- URGENT — arrêter l'envoi en cours d'accusés de paiement pour des encaissements anciens.
-- Signalé par le client le 2026-11-25 : « il y a des mails de confirmation de paiement alors que
-- la personne n'a pas encore payé ».
--
-- CE DÉFAUT EST LE MIEN. La migration 0169 a inséré le 2026-11-23 à 20:48 les 91 reçus manquants
-- du passé. J'y avais pris soin de museler le canal des NOTIFICATIONS (désactivation du trigger
-- `notifier_destinataire_nouveau_document`) — et j'ai laissé le canal E-MAIL grand ouvert.
--
-- Or le cron de 9 h (`relances-echeances.ts`, `annoncerRecus`) sélectionne les reçus à annoncer
-- sur `created_at`, la date d'ÉCRITURE de la ligne, et non sur la date de l'encaissement. Des
-- reçus écrits avant-hier pour des paiements du 2026-10-29 lui apparaissent donc comme « tout
-- frais ». Le 24/11 puis le 25/11 à 6 h 09 UTC, il a expédié « Nous avons bien reçu votre
-- paiement de X Ar, merci ! » à 34 élèves pour des règlements vieux de 26 jours.
--
-- C'est, à l'identique, le piège du 2026-10-29 (« un import historique réveille les relances »).
-- Je l'ai vu venir sur un canal et pas sur l'autre.
--
-- Pourquoi `date_emission` et pas `created_at` : 0169 a posé `date_emission` à la date réelle du
-- paiement. C'est le seul repère qui distingue un encaissement d'hier d'un encaissement d'octobre
-- rattrapé avant-hier.
--
-- Pourquoi marquer « annoncé » plutôt que supprimer les reçus : le reçu est une pièce comptable,
-- il doit exister. Seule son ANNONCE n'a plus lieu d'être. `email_envoye_le` dit alors la vérité
-- utile au cron — « ne l'annonce pas » — même si personne n'a rien reçu.
--
-- Ce que cette migration NE touche PAS : les reçus de moins de 7 jours (encaissements des 20, 23
-- et 24 novembre), qui sont de vrais paiements récents et doivent bien être annoncés demain matin.
begin;

update public.invoices
set email_envoye_le = now()
where numero like 'REC-%'
  and email_envoye_le is null
  and date_emission < (current_date - 7);

commit;
