/* Filtre `.in(colonne, ids)` découpé en lots — revue de performance du 2026-10-20.

   PostgREST reçoit un `.in()` dans l'URL de la requête : 36 caractères par UUID, plus le
   séparateur. Au-delà de quelques centaines d'identifiants, l'URL dépasse ce que la passerelle
   accepte et la requête échoue en bloc — et comme la plupart des hooks lisent `data ?? []`, l'échec
   ne se voit pas : la liste revient vide, et l'écran affiche « aucun compte rendu » ou « aucun
   cours planifié » à tort. Les listes qui couvrent TOUT l'établissement (comptes rendus, séances à
   venir de tous les élèves) grossissent à chaque séance ; 285 séances existaient déjà le jour de ce
   correctif.

   Les lots partent en parallèle et leurs lignes sont concaténées : l'ordre global n'est donc pas
   garanti, ce qui convient aux appelants actuels (ils indexent le résultat dans une Map). */
export const TAILLE_LOT_IN = 100

export async function selectionParLots<T>(
  ids: readonly string[],
  requete: (lot: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  taille: number = TAILLE_LOT_IN,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const uniques = [...new Set(ids)]
  if (uniques.length === 0) return { data: [], error: null }
  const lots: string[][] = []
  for (let i = 0; i < uniques.length; i += taille) lots.push(uniques.slice(i, i + taille))
  const reponses = await Promise.all(lots.map((lot) => requete(lot)))
  const erreur = reponses.find((r) => r.error)?.error ?? null
  return { data: reponses.flatMap((r) => r.data ?? []), error: erreur }
}
