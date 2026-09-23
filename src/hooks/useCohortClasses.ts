import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type CohortClass = Database['public']['Tables']['cohort_classes']['Row']

/* Classes de niveau d'une promotion (0074). `cohortId` à null suspend la requête — utile tant
   que l'admin n'a pas encore choisi de promotion (voir AssignerVague.tsx). */
export function useCohortClasses(cohortId: string | null) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(cohortId ? `cohort_classes:${cohortId}` : null, async () => {
    const { data, error } = await supabase
      .from('cohort_classes')
      .select('*')
      .eq('cohort_id', cohortId as string)
      .order('niveau')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { classes: valeur ?? ([] as CohortClass[]), loading, erreur, recharger }
}
