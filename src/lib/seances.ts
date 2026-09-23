/* Une inscription peut survivre au compte de l'élève : la suppression d'un étudiant est une
   suppression douce (`status = 'suspended'`, voir api/admin/supprimer-utilisateur.ts) et toutes
   les vues masquent désormais ces profils. L'inscription, elle, reste en base — c'est une trace
   pédagogique — mais son profil n'est plus résoluble. Afficher « Élève supprimé » plutôt qu'un
   « ? » muet, comme on le fait déjà pour un prospect supprimé (agendaEvenements.ts). */
export function nomEleveInscrit(
  etudiant: { prenom: string | null; nom: string | null } | null | undefined,
): string {
  if (!etudiant) return 'Élève supprimé'
  return `${etudiant.prenom ?? ''} ${etudiant.nom ?? ''}`.trim()
}

export function nomsElevesInscrits(
  inscriptions: { etudiant: { prenom: string | null; nom: string | null } | null }[],
): string[] {
  return inscriptions.map((i) => nomEleveInscrit(i.etudiant))
}

/* Revu le 2026-09-23 : un compte supprimé ne doit plus laisser aucune trace visible NULLE PART,
   passé compris (demande client explicite — « il faut enlever toutes les informations lui
   concernant [...] les rendez-vous passés, planning, rendez-vous futur »). L'ancienne version ne
   filtrait que l'avenir, en gardant l'historique intact par souci de traçabilité pédagogique ;
   ce choix est désormais surclassé par la demande du client. Les données ne sont PAS supprimées
   en base (la personne peut se réinscrire plus tard) — seul l'AFFICHAGE change.

   Renvoie `null` quand la séance entière est à masquer : elle avait des inscrits, tous
   supprimés. Une séance créée sans aucun inscrit est légitime et reste visible (aucun rapport
   avec une suppression de compte). */
export function inscriptionsVisibles<I extends { etudiant: unknown | null }>(
  inscriptions: I[],
): I[] | null {
  const actives = inscriptions.filter((i) => i.etudiant)
  if (inscriptions.length > 0 && actives.length === 0) return null
  return actives
}
