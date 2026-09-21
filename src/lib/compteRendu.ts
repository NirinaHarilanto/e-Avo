/* Template du compte rendu de séance, fourni par le client le 2026-09-21. Décrit en données
   plutôt qu'en JSX, comme le questionnaire de diagnostic (voir lib/diagnostic.ts) : le
   formulaire de saisie du professeur et l'affichage en lecture seule (admin, élève) partagent
   la même liste de champs, ce qui évite qu'un champ ajouté au template soit oublié à l'un des
   deux endroits. */

export type ObjectifCours = 'grammar' | 'vocabulary' | 'speaking' | 'listening' | 'reading' | 'writing'

export const OBJECTIFS_COURS: { valeur: ObjectifCours; libelle: string }[] = [
  { valeur: 'grammar', libelle: 'Grammar' },
  { valeur: 'vocabulary', libelle: 'Vocabulary' },
  { valeur: 'speaking', libelle: 'Speaking' },
  { valeur: 'listening', libelle: 'Listening' },
  { valeur: 'reading', libelle: 'Reading' },
  { valeur: 'writing', libelle: 'Writing' },
]

export type NiveauProgres = 'important' | 'bon' | 'modere' | 'faible'

export const NIVEAUX_PROGRES: { valeur: NiveauProgres; libelle: string }[] = [
  { valeur: 'important', libelle: 'Important' },
  { valeur: 'bon', libelle: 'Bon' },
  { valeur: 'modere', libelle: 'Modéré' },
  { valeur: 'faible', libelle: 'Faible' },
]

/* Zones de texte du template, dans l'ordre d'affichage voulu par le client. `cle` correspond
   directement à la colonne de `session_reports` (migration 0052). */
export const CHAMPS_TEXTE_COMPTE_RENDU: { cle: string; libelle: string; aide?: string }[] = [
  { cle: 'lecons_abordees', libelle: 'Leçons abordées' },
  { cle: 'contenu_cours', libelle: 'Contenu du cours' },
  { cle: 'nouveau_vocabulaire', libelle: 'Nouveau vocabulaire' },
  { cle: 'erreurs_importantes', libelle: 'Erreurs importantes' },
  { cle: 'points_forts', libelle: 'Points forts' },
  { cle: 'points_a_ameliorer', libelle: 'Points à améliorer' },
  { cle: 'devoirs', libelle: 'Devoirs' },
]

/* Priorités et conseils viennent après la note de progrès dans le template : séparés de la
   liste ci-dessus pour que le formulaire puisse intercaler le sélecteur de progrès entre les
   deux groupes, exactement comme le document fourni par le client. */
export const CHAMPS_TEXTE_SUITE: { cle: string; libelle: string }[] = [
  { cle: 'priorites_prochain_cours', libelle: 'Priorités du prochain cours' },
  { cle: 'conseils_prochain_professeur', libelle: 'Conseils au prochain professeur' },
]

export interface CompteRenduValeurs {
  objectifs: string[]
  lecons_abordees: string | null
  contenu_cours: string | null
  nouveau_vocabulaire: string | null
  erreurs_importantes: string | null
  points_forts: string | null
  points_a_ameliorer: string | null
  devoirs: string | null
  progres: string | null
  priorites_prochain_cours: string | null
  conseils_prochain_professeur: string | null
}

export function compteRenduRempli(valeurs: CompteRenduValeurs): boolean {
  return (
    valeurs.objectifs.length > 0 ||
    !!valeurs.progres ||
    [...CHAMPS_TEXTE_COMPTE_RENDU, ...CHAMPS_TEXTE_SUITE].some(
      (champ) => (valeurs[champ.cle as keyof CompteRenduValeurs] as string | null)?.trim(),
    )
  )
}

export function libelleObjectif(valeur: string): string {
  return OBJECTIFS_COURS.find((o) => o.valeur === valeur)?.libelle ?? valeur
}

export function libelleProgres(valeur: string | null): string | null {
  return NIVEAUX_PROGRES.find((n) => n.valeur === valeur)?.libelle ?? valeur
}
