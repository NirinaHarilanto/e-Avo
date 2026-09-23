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

export function seanceAVenir(session: { debut: string; statut: string }): boolean {
  return session.statut === 'planifiee' && new Date(session.debut).getTime() > Date.now()
}

/* Le passé est de l'historique : on le montre tel quel, « Élève supprimé » compris. L'avenir,
   lui, ne doit plus faire état de quelqu'un qui n'est plus là — un créneau encore planifié pour
   un compte supprimé n'aura jamais lieu. Renvoie `null` quand la séance entière est à masquer :
   elle avait des inscrits, tous supprimés. Une séance créée sans aucun inscrit est légitime et
   reste visible. */
export function inscriptionsVisibles<I extends { etudiant: unknown | null }>(
  session: { debut: string; statut: string },
  inscriptions: I[],
): I[] | null {
  if (!seanceAVenir(session)) return inscriptions
  const actives = inscriptions.filter((i) => i.etudiant)
  if (inscriptions.length > 0 && actives.length === 0) return null
  return actives
}
