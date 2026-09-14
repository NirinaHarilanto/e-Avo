import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Cohort = Database['public']['Tables']['cohorts']['Row']

export function useCohortes() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('cohortes', async () => {
    const { data, error } = await supabase.from('cohorts').select('*').order('date_debut', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { cohortes: valeur ?? ([] as Cohort[]), loading, erreur, recharger }
}
