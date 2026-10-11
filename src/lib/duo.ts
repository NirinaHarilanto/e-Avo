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

/* Une seule entrée de liste par binôme — demande client du 2026-10-11 : « il ne faut garder que
   le bloc qui contient les informations des deux personnes qui forment le DUO ». Côté professeur,
   `useCalendrierProfesseur` ajoute DÉLIBÉRÉMENT les partenaires DUO à `etudiantsActifs` pour
   qu'ils restent trouvables dans le formulaire de planification d'une séance (demande du
   2026-09-23) ; la page « Mes étudiants », qui rend une carte par entrée, en affichait donc deux
   pour le même binôme : celle du principal (avec les deux noms) et celle du secondaire seul.

   Le lien DUO est ASYMÉTRIQUE et cette fonction en dépend : seul le secondaire porte
   `duo_partenaire_id` (migration 0054, « Jamais l'inverse — le principal n'a pas ce champ
   renseigné »), donc le filtre ne peut jamais retirer les DEUX membres. Un secondaire dont le
   principal n'est PAS dans la liste garde sa propre entrée : il serait sinon invisible. */
export function sansSecondairesDuo<T extends { id: string; duo_partenaire_id: string | null }>(personnes: T[]): T[] {
  const presents = new Set(personnes.map((p) => p.id))
  return personnes.filter((p) => !(p.duo_partenaire_id && presents.has(p.duo_partenaire_id)))
}
