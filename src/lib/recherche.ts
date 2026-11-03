/* Recherche d'une personne par son nom, telle qu'on la tape vraiment.

   Né d'un cas réel (2026-11-04) : « Nomena ANDRY TAHIANA », tout juste converti de prospect en
   étudiant, restait introuvable dans la liste des étudiants. Le filtre comparait la saisie à
   « prénom nom » d'un bloc (`"nomena andry tahiana".includes("andry nomena")`), si bien que
   taper le NOM avant le PRÉNOM — l'usage courant à Madagascar — ne ramenait rien. L'élève
   paraissait disparu alors que sa fiche était intacte en base.

   Deux règles, celles que `ChampSelectionPersonnes` appliquait déjà de son côté :
   - chaque mot tapé doit se retrouver quelque part dans la cible, dans N'IMPORTE QUEL ordre ;
   - les accents sont ignorés des deux côtés, pour que « anais » trouve « Anaïs ». */

/** Minuscules, accents retirés — à appliquer des DEUX côtés de la comparaison. */
export function normaliserPourRecherche(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * `cible` contient-elle tous les mots de `recherche`, quel que soit leur ordre ?
 * Une recherche vide laisse tout passer : c'est l'état au chargement d'un écran.
 */
export function correspondARecherche(cible: string, recherche: string): boolean {
  const termes = normaliserPourRecherche(recherche).split(/\s+/).filter(Boolean)
  if (termes.length === 0) return true
  const cibleNormalisee = normaliserPourRecherche(cible)
  return termes.every((terme) => cibleNormalisee.includes(terme))
}
