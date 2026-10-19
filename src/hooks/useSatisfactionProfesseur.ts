import { supabase } from '../lib/supabaseClient'
import { useCacheRequete } from './useCacheRequete'

export interface SatisfactionProfesseur {
  /* Nombre d'avis par note globale, de 1 à 5 étoiles — index 0 = 1 étoile. */
  repartition: [number, number, number, number, number]
  total: number
  moyenne: number | null
  /* Part d'avis à 4 ou 5 étoiles, l'indicateur que le client appelle « taux de satisfaction ». */
  tauxSatisfaction: number | null
}

const VIDE: SatisfactionProfesseur = { repartition: [0, 0, 0, 0, 0], total: 0, moyenne: null, tauxSatisfaction: null }

/* Satisfaction d'un professeur, agrégée pour le KPI en disque demandé le 2026-09-23 (point 5).
   Alimentée par les ENQUÊTES DE PARCOURS (`jalons_parcours`, 0130) depuis le 2026-10-19 : la
   demande 8 remplace l'enquête de fin de séance par deux enquêtes par parcours, l'indicateur suit
   donc sa nouvelle source. Même disque, mêmes couleurs, mais deux avis par élève et par forfait
   au lieu d'un par cours.

   `teacher_id` est figé sur le jalon au moment où il est posé : un professeur n'hérite donc jamais
   des avis portant sur son prédécesseur, même après un transfert d'élève. La RLS (0130) laisse un
   professeur lire les jalons de ses élèves et l'admin ceux de tout l'établissement.

   Les avis déposés avant ce changement vivent encore dans `session_satisfaction` et ne sont plus
   comptés ici : le KPI repart donc de zéro, à signaler au client. La table est conservée, rien
   n'est perdu. */
export function useSatisfactionProfesseur(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    teacherId && `satisfaction-professeur-${teacherId}`,
    async (): Promise<SatisfactionProfesseur> => {
      const { data: avis, error: erreurAvis } = await supabase
        .from('jalons_parcours')
        .select('note_globale')
        .eq('teacher_id', teacherId as string)
        .not('repondu_le', 'is', null)
      if (erreurAvis) throw new Error(erreurAvis.message)

      const repartition: [number, number, number, number, number] = [0, 0, 0, 0, 0]
      for (const a of avis ?? []) {
        if (a.note_globale === null) continue
        const index = Math.min(5, Math.max(1, a.note_globale)) - 1
        repartition[index] += 1
      }
      const total = repartition.reduce((somme, n) => somme + n, 0)
      if (total === 0) return VIDE

      const sommeNotes = repartition.reduce((somme, n, i) => somme + n * (i + 1), 0)
      return {
        repartition,
        total,
        moyenne: sommeNotes / total,
        tauxSatisfaction: Math.round(((repartition[3] + repartition[4]) / total) * 100),
      }
    },
  )

  return { satisfaction: valeur ?? VIDE, loading, erreur, recharger }
}
