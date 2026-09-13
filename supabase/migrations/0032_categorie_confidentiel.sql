-- Nouvelle catégorie de document "confidentiel" — Phase 6 du chantier "Hari Online Club".
-- Isolée dans sa propre migration : `alter type ... add value` ne peut pas être utilisée dans
-- la même transaction qu'une contrainte/policy qui référence déjà cette nouvelle valeur
-- (limitation Postgres), d'où le fichier 0033 séparé pour tout le reste.
alter type public.categorie_document add value 'confidentiel';
