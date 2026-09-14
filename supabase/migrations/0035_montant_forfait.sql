-- Montant convenu pour le forfait d'heures d'un étudiant. Figé sur le forfait plutôt que
-- recalculé depuis la grille `tarifs` (0026) au moment de l'affichage : cette grille est une
-- brochure marketing librement éditable (titre/prix/unité en texte libre, modifiables à tout
-- moment depuis l'espace admin), et le montant sert de référence dans des contrats signés — il
-- ne doit pas changer rétroactivement parce que la brochure a été mise à jour. Même principe
-- que `contracts.corps_genere`, figé à l'émission (0021).
alter table public.packages
  add column montant numeric(10, 2);
