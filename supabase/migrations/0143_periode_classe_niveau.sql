-- Période de cours propre à chaque classe de niveau d'un cours collectif.
--
-- Demande client du 2026-10-30 : « chaque classe a sa propre période de cours [...] la période
-- s'affichera à côté de l'intitulé Niveau de chaque classe ». Jusqu'ici seule la VAGUE
-- (`cohorts.date_debut`/`date_fin`) portait des dates ; une classe de niveau au sein de la vague
-- n'avait pas les siennes, alors qu'une classe peut démarrer ou finir à un autre moment que le
-- reste de la promotion (ex. une classe Advanced ouverte plus tard, le temps d'atteindre l'effectif
-- minimum).
--
-- Nullable : une classe sans période renseignée garde le comportement d'avant cette migration
-- (rien à afficher), l'admin la renseigne quand il le souhaite depuis « Modifier la classe ».
alter table public.cohort_classes
  add column date_debut date,
  add column date_fin date;
