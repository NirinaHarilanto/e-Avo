import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Tarif = Database['public']['Tables']['tarifs']['Row']

export function useTarifs(etablissementId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(etablissementId && `tarifs-${etablissementId}`, async () => {
    const { data, error } = await supabase.from('tarifs').select('*').eq('etablissement_id', etablissementId as string).order('ordre')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { tarifs: valeur ?? ([] as Tarif[]), loading, erreur, recharger }
}
