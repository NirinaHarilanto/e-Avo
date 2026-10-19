import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type PrestationExterne = Database['public']['Tables']['prestations_externes']['Row']

/* Prestations corporate et chat & chill d'un professeur (0131, demande client du 2026-10-19).

   Un seul hook pour les deux espaces : c'est la RLS qui décide de ce qui remonte — l'admin voit
   celles de tout l'établissement, le professeur uniquement les siennes. L'écran professeur passe
   donc son propre identifiant et obtient exactement la même liste que celle que l'admin voit sur
   sa fiche.

   Les plus récentes d'abord : une prestation à venir ou tout juste donnée est ce qu'on vient
   consulter ; l'historique se déroule en dessous. */
export function usePrestationsExternes(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    teacherId && `prestations-externes-${teacherId}`,
    async () => {
      const { data, error } = await supabase
        .from('prestations_externes')
        .select('*')
        .eq('teacher_id', teacherId as string)
        .order('debut', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  )

  return { prestations: valeur ?? [], loading, erreur, recharger }
}
