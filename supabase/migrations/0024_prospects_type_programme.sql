-- La landing distingue désormais 3 programmes (individuel, duo, collectif) : individuel et duo
-- mènent à un appel diagnostic, collectif à un test de positionnement. Même structure
-- (diagnostic_calls, statut_prospect inchangés) — seul le libellé affiché change selon ce
-- champ, capturé à la soumission du formulaire prospect.
create type public.type_programme_prospect as enum ('individuel', 'duo', 'collectif');

alter table public.prospects
  add column type_programme public.type_programme_prospect;
