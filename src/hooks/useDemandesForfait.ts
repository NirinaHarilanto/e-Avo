import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type DemandeForfait = Database['public']['Tables']['demandes_forfait']['Row']

/* Demandes de forfait supplémentaire d'un élève (0061) — utilisé côté élève (ses propres
   demandes, toutes) et côté admin (celles d'un élève précis, dans son dossier). La RLS filtre
   déjà selon qui regarde : l'élève ne voit que les siennes, l'admin voit celles de son
   établissement. */
export function useDemandesForfait(studentId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    studentId && `demandes-forfait-${studentId}`,
    async () => {
      const { data, error } = await supabase
        .from('demandes_forfait')
        .select('*')
        .eq('student_id', studentId as string)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  )

  const demandes = valeur ?? ([] as DemandeForfait[])
  return { demandes, enAttente: demandes.filter((d) => d.statut === 'en_attente'), loading, erreur, recharger }
}
