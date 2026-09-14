import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type ContractTemplate = Database['public']['Tables']['contract_templates']['Row']

export function useContratsTypes() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('contrats-types', async () => {
    const { data, error } = await supabase.from('contract_templates').select('*').order('nom')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { modeles: valeur ?? ([] as ContractTemplate[]), loading, erreur, recharger }
}
