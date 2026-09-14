import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Profile = Database['public']['Tables']['profiles']['Row']

export function useProfesseurs() {
  const { valeur, loading, recharger } = useCacheRequete('professeurs', async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'professeur').order('nom')
    return data ?? []
  })

  return { professeurs: valeur ?? ([] as Profile[]), loading, recharger }
}
