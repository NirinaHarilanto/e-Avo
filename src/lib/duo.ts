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

/* Nom d'une personne suivi de son binôme DUO, s'il y en a un — demande client du 2026-09-23 :
   « dans toutes les fenêtres [...] afficher les deux noms des personnes formant le DUO ». Une
   seule fonction pour ne jamais faire diverger le séparateur (« & », déjà celui du sous-titre du
   dossier étudiant, DossierEtudiantVue.tsx) entre les différents endroits qui l'affichent. */
export function nomAvecDuo(
  personne: { prenom: string | null; nom: string | null },
  partenaire: { prenom: string | null; nom: string | null } | null | undefined,
): string {
  const nom = `${personne.prenom ?? ''} ${personne.nom ?? ''}`.trim()
  if (!partenaire) return nom
  return `${nom} & ${partenaire.prenom ?? ''} ${partenaire.nom ?? ''}`.trim()
}
