-- Prolongation d'une séance d'essai : un forfait par tranche, chacun avec son paiement.
--
-- Demande client du 2026-10-11 : « Elle a pris une heure d'essai, puis elle a prolongé 2 heures
-- d'essais. On devrait alors avoir deux lignes de paiements distincts pour chaque forfait pris. »
--
-- La prolongation livrée plus tôt le même jour ALLONGEAIT le forfait d'essai existant
-- (total_heures 1 → 3, montant 35 000 → 105 000). Le défaut est apparu immédiatement en
-- production : le paiement de 35 000 Ar déjà encaissé restait rattaché à ce forfait et s'affichait
-- désormais comme « Forfait Individuel · 3 h », alors que son reçu, lui, était figé sur « 1 h ».
-- C'est exactement ce que 0057 avait voulu éviter en posant le modèle des forfaits successifs :
-- « une facture émise est figée dans ce schéma — on ne doit jamais avoir à réécrire une facture
-- d'1 h en facture de 20 h ».
--
-- Une prolongation crée donc désormais un NOUVEAU forfait d'essai, portant les seules heures
-- ajoutées et leur seul montant, et le forfait précédent est clos par `essai_resultat =
-- 'prolonge'`. Sans cette troisième valeur, deux forfaits d'essai resteraient simultanément « en
-- attente de décision » (`essai_resultat is null`), un état ambigu : l'écran de décision ne
-- regarde que le dernier forfait souscrit, et l'historique du dossier afficherait « Essai » sans
-- suite pour le premier.
--
-- 'prolonge' n'est PAS une décision finale au sens métier : elle dit seulement que cette
-- tranche-là est close parce qu'une autre a pris le relais. La décision finale (poursuivre avec
-- un forfait complet, ou s'arrêter) se prend toujours sur la dernière tranche.

alter table public.packages
  drop constraint if exists packages_essai_resultat_check;

alter table public.packages
  add constraint packages_essai_resultat_check
  check (essai_resultat in ('poursuivi', 'arrete', 'prolonge'));

comment on column public.packages.essai_resultat is
  'Décision prise après la séance d''essai : poursuivi (un forfait complet a été créé), arrete, ou prolonge (une tranche d''essai supplémentaire a pris le relais, voir le forfait d''essai suivant). Nul tant que rien n''est tranché.';
