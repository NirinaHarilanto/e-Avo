-- Précision en texte libre du diplôme déclaré, pour le choix « Autre diplôme ou certificat »
-- (0082) — demande client du 2026-10-10 : « quand on clique sur autre diplôme ou certificat, une
-- zone de texte libre devrait s'afficher afin que l'utilisateur puisse mettre le nom ou la
-- description de son diplôme, obligatoire ».
--
-- Colonne nullable et sans contrainte CHECK liée à `diplome_declare` : un candidat qui a choisi
-- « autre » puis changé d'avis pour « licence_anglais » avant d'envoyer son dossier ne doit pas
-- être bloqué par une incohérence entre les deux colonnes — l'obligation se contrôle côté
-- formulaire et côté API (candidater.ts), pas en base.
alter table public.candidatures_formateurs
  add column diplome_autre_precision text;

comment on column public.candidatures_formateurs.diplome_autre_precision is
  'Nom ou description du diplôme/certificat quand diplome_declare = ''autre''. Renseigné par le candidat lui-même, affiché tel quel dans sa fiche admin.';
