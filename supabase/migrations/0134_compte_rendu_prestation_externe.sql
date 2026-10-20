-- Demande client du 2026-10-20 : « pour les cours corporate & chat and chill, le professeur
-- concerné devrait renseigner un compte rendu au moment de la clôture de la séance. Ce compte
-- rendu pourra être visible par le professeur depuis l'espace professeur et par l'admin depuis
-- l'espace admin. »
--
-- Une colonne libre, pas le gabarit pédagogique complet de `session_reports` (objectifs,
-- vocabulaire, progrès de l'élève…) : une prestation externe n'a ni élève, ni cursus, ni
-- programme à suivre d'une séance à l'autre — un cours corporate ou un chat & chill n'a pas de
-- "points à améliorer" au sens où l'entend le suivi pédagogique HOC. Même principe de sobriété
-- que `notes` sur cette même table, déjà du texte libre.
--
-- `notes` existant ne convient pas : c'est un champ PRÉALABLE (rempli à la création/modification,
-- verrouillé dès que la prestation est clôturée — voir peutEtreModifiee côté code). Le compte
-- rendu, lui, ne peut exister qu'APRÈS la séance, et seul le professeur qui l'a donnée doit
-- pouvoir l'écrire — exactement le rôle que joue déjà `session_reports` pour une séance normale.

begin;

alter table public.prestations_externes
  add column compte_rendu text,
  add column compte_rendu_le timestamptz;

comment on column public.prestations_externes.compte_rendu is
  'Compte rendu libre du professeur, renseigné après la clôture de la prestation (0134). Jamais écrit avant : une prestation encore planifiée n''a rien eu lieu à rendre compte.';

-- Écriture réservée au professeur concerné, sur sa PROPRE prestation déjà terminée — le serveur
-- (api/prestations/enregistrer-compte-rendu.ts) vérifie ces deux conditions avant d'écrire, avec
-- la clé service_role comme la clôture elle-même (0131) : aucune policy client n'est nécessaire
-- ni ajoutée, cohérent avec `prestations_externes_teacher_select` existante, qui ne donne déjà au
-- professeur qu'un accès en LECTURE sur ses prestations — jamais en écriture directe depuis le
-- navigateur, ici comme pour la clôture.

commit;
