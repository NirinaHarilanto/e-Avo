-- Catégories de document personnalisées (demande client du 2026-10-10) : « rajoute un bouton
-- pour pouvoir rajouter une catégorie dans la liste déroulante ». `documents.categorie` reste
-- l'ENUM Postgres fixe (`categorie_document`, 0033) — en particulier sa valeur `confidentiel`,
-- sur laquelle les policies RESTRICTIVE de 0033 portent littéralement (`categorie <> 'confidentiel'`
-- dans trois policies) : y ajouter des valeurs à la volée depuis l'écran serait un risque direct
-- sur ce verrou de confidentialité, et de toute façon `ALTER TYPE ... ADD VALUE` ne peut pas
-- s'exécuter puis être utilisé dans la même transaction.
--
-- Une catégorie « personnalisée » reste donc, en base, `categorie = 'autre'` — rien ne change à
-- la sécurité existante — avec un LIBELLÉ LIBRE en plus, dans une colonne à part. L'écran
-- construit sa liste déroulante en lisant les libellés déjà utilisés par l'établissement
-- (distincts, dérivés des documents existants) plutôt que depuis une table de référence dédiée :
-- plus simple, cohérent avec le reste du schéma (ex. TagProgramme, 0074), suffisant pour une
-- poignée d'étiquettes par établissement.
alter table public.documents
  add column categorie_libre text;

-- Un libellé n'a de sens QUE pour la catégorie « autre » : les huit autres valeurs de l'enum ont
-- déjà un sens fixe et documenté, leur adjoindre un libellé libre contradictoire serait trompeur.
alter table public.documents
  add constraint documents_categorie_libre_coherente
  check (categorie_libre is null or categorie = 'autre');

comment on column public.documents.categorie_libre is
  'Étiquette libre, saisie par l''admin, quand categorie = ''autre'' — "catégorie personnalisée" côté écran. NULL pour les huit catégories fixes, qui gardent leur sens propre.';
