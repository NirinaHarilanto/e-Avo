import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Profile = Database['public']['Tables']['profiles']['Row']

export function useEtudiants() {
  const { valeur, loading, recharger } = useCacheRequete('etudiants', async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'etudiant').neq('status', 'suspended').order('nom')
    return data ?? []
  })

  return { etudiants: valeur ?? ([] as Profile[]), loading, recharger }
}
