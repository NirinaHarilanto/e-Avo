-- Fusion des niveaux de classe « Pre-Advanced » et « Advanced » en un seul niveau « Advanced ».
--
-- Demande client du 2026-10-30 : « pre-advanced et advanced, finalement c'est le même niveau,
-- garder Advanced comme intitulé du niveau ». « Pre-Advanced » n'avait été ajouté que la veille
-- (migration 0139) pour reprendre une classe réelle de la promotion en cours ; l'application ne
-- propose plus ce niveau à la création d'une classe (LABEL_NIVEAU_CLASSE, classesCollectif.ts).
--
-- Reclasse toute classe déjà créée sur « pre_advanced » vers « advanced », sans y toucher si
-- aucune n'existe.
--
-- La valeur `pre_advanced` reste techniquement présente dans l'enum Postgres `niveau_classe` :
-- Postgres ne permet pas de retirer une valeur d'un enum sans reconstruire tout le type (et les
-- colonnes qui l'utilisent). Elle devient simplement inerte, plus jamais écrite ni proposée.
update public.cohort_classes
set niveau = 'advanced'
where niveau = 'pre_advanced';
