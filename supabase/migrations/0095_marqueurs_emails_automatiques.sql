-- Garde-fous des envois automatiques décidés le 2026-10-01 (modèles 2.3 « Facture / accusé de
-- réception du paiement » et 5.3 « Fin du volume d'heures »).
--
-- Les deux sont déclenchés par le cron quotidien et non par un clic : sans marqueur, le même
-- e-mail repartirait tous les matins tant que la condition reste vraie — un élève à qui il reste
-- 4 heures recevrait trente relances en un mois. Même principe que `relance_envoyee_le` sur les
-- échéances de paiement (0078), qui garde déjà cette propriété.
--
-- Marqueur sur la ligne concernée plutôt que dans une table de journal : la condition « déjà
-- envoyé ? » se lit alors au même endroit que la donnée qui la déclenche, et aucune jointure ne
-- peut être oubliée dans la requête du cron.

-- 2.3 : le reçu est créé par trigger au passage d'un paiement à « payé » (0030). Un trigger SQL ne
-- peut pas envoyer d'e-mail ; le cron reprend donc les reçus récents non encore annoncés.
alter table public.invoices
  add column email_envoye_le timestamptz;

comment on column public.invoices.email_envoye_le is
  'Horodatage de l''e-mail annonçant ce reçu/facture à l''élève (modèle 2.3). Null = jamais annoncé.';

-- 5.3 : alerte de fin de volume d'heures, une seule fois par forfait.
alter table public.packages
  add column email_fin_heures_le timestamptz;

comment on column public.packages.email_fin_heures_le is
  'Horodatage de l''e-mail « il vous reste X heures » (modèle 5.3). Null = jamais alerté.';

-- Seuil de déclenchement, réglable par établissement comme le délai de relance des échéances :
-- 5 heures par défaut, soit deux à trois séances — assez tôt pour renouveler sans interruption,
-- assez tard pour que l'élève ait déjà de quoi juger de sa progression.
alter table public.etablissements
  add column seuil_alerte_heures_restantes integer not null default 5;
