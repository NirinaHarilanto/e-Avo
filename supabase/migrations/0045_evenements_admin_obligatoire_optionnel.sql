-- Remplace la distinction étudiants/professeurs de evenements_admin (0044) par une distinction
-- obligatoire/optionnel, sur le modèle des participants « Requis »/« Facultatif » d'Outlook —
-- demande client du 2026-09-16. Les deux zones de recherche du formulaire de création cherchent
-- désormais indifféremment parmi TOUTES les personnes de l'établissement (étudiants ET
-- professeurs mélangés) : la distinction par rôle, utile pour la couleur de la pastille dans
-- l'agenda, se déduit à la lecture en croisant ces tableaux avec profiles.role plutôt que d'être
-- portée par la colonne elle-même.
--
-- La table vient d'être créée (0044) et ne contient aucune ligne en production au moment de cette
-- migration : pas de UPDATE de bascule nécessaire, un simple ajout puis suppression de colonnes
-- suffit.
alter table public.evenements_admin
  add column participants_obligatoires uuid[] not null default '{}',
  add column participants_optionnels uuid[] not null default '{}';

alter table public.evenements_admin
  drop constraint evenements_admin_participants;

alter table public.evenements_admin
  drop column student_ids,
  drop column teacher_ids;

alter table public.evenements_admin
  add constraint evenements_admin_participants check (
    coalesce(array_length(participants_obligatoires, 1), 0) > 0
    or coalesce(array_length(participants_optionnels, 1), 0) > 0
  );
