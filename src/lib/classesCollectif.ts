/* Classes de niveau des cours collectifs (0074) : mapping pur entre le niveau CECRL estimé au
   quiz écrit (voir quiz.ts) et le niveau de classe (Beginner/Intermediate/Advanced) demandé par
   le client, et constantes de capacité d'une classe. Aucune requête, aucune horloge — testable
   isolément, comme quiz.ts. */

import type { NiveauClasse, CreneauClasse } from '../types/database.types.js'

export const LABEL_NIVEAU_CLASSE: Record<NiveauClasse, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export const LABEL_CRENEAU_CLASSE: Record<CreneauClasse, string> = {
  matin: 'Matin',
  midi: 'Midi',
  soir: 'Soir',
}

/* En dessous de ce seuil, la classe ne doit pas démarrer ses cours (règle client) — un signal
   pour l'admin, pas un blocage d'inscription. */
export const CAPACITE_MIN_CLASSE = 3
/* Au-delà, l'inscription est bloquée par le trigger `cohort_enrollments_capacite_classe`
   (migration 0074) : il faut ouvrir une seconde classe du même niveau. */
export const CAPACITE_MAX_CLASSE = 7

/* Barème convenu avec le client : le niveau CECRL du quiz écrit détermine automatiquement la
   classe de niveau, sans ressaisie. `null` quand le niveau n'est pas encore connu (candidat pas
   encore passé au quiz, ou test non concluant) — dans ce cas, aucune classe n'est proposée
   automatiquement, l'admin affecte à la main. */
export function categorieDepuisNiveauEstime(niveauEstime: string | null): NiveauClasse | null {
  switch (niveauEstime) {
    case 'A1 (débutant)':
    case 'A2':
      return 'beginner'
    case 'B1':
    case 'B2':
      return 'intermediate'
    case 'C1':
      return 'advanced'
    default:
      return null
  }
}
