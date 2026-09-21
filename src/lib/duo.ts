/* Nom affiché pour un binôme DUO — demande client du 2026-09-21 : facultatif à la réservation,
   et à défaut « Prénom1/Prénom2 ». Une seule fonction pure, utilisée aussi bien pour les deux
   prospects liés (avant conversion) que pour les deux profils liés (après conversion), pour ne
   jamais recalculer ce repli différemment à deux endroits. */
export function nomGroupeDuo(
  nomSaisi: string | null | undefined,
  prenomA: string,
  prenomB: string,
): string {
  const propre = nomSaisi?.trim()
  return propre && propre.length > 0 ? propre : `${prenomA}/${prenomB}`
}
