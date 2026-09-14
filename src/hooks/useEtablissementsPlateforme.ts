import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

export function useEtablissementsPlateforme() {
  const { valeur, loading, recharger } = useCacheRequete('etablissements-plateforme', async () => {
    const { data } = await supabase.from('etablissements').select('*').order('nom')
    return data ?? []
  })

  return { etablissements: valeur ?? ([] as Etablissement[]), loading, recharger }
}
