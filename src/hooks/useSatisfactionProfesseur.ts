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

/* Enquêtes de satisfaction des séances d'un professeur (0068), agrégées pour le KPI en disque
   demandé le 2026-09-23 (point 5). Deux requêtes plutôt qu'une jointure : `session_satisfaction`
   n'a pas de `teacher_id`, le lien passe par `sessions.teacher_id`. La RLS laisse déjà un
   professeur lire les avis de ses seules séances et l'admin ceux de tout l'établissement. */
export function useSatisfactionProfesseur(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    teacherId && `satisfaction-professeur-${teacherId}`,
    async (): Promise<SatisfactionProfesseur> => {
      const { data: sessions, error } = await supabase.from('sessions').select('id').eq('teacher_id', teacherId as string)
      if (error) throw new Error(error.message)
      const ids = (sessions ?? []).map((s) => s.id)
      if (ids.length === 0) return VIDE

      const { data: avis, error: erreurAvis } = await supabase
        .from('session_satisfaction')
        .select('note_globale')
        .in('session_id', ids)
      if (erreurAvis) throw new Error(erreurAvis.message)

      const repartition: [number, number, number, number, number] = [0, 0, 0, 0, 0]
      for (const a of avis ?? []) {
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
