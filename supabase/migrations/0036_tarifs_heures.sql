-- Relie une ligne de tarif à un nombre d'heures précis (10h, 20h…), pour pouvoir la retrouver
-- automatiquement depuis le forfait d'un étudiant plutôt que de ne servir qu'à l'affichage
-- libre de la brochure publique. Nullable : une ligne « Collectif » ou tout autre tarif non
-- lié à un volume d'heures fixe (abonnement mensuel, par exemple) n'a simplement rien à y
-- mettre.
alter table public.tarifs
  add column heures integer;
