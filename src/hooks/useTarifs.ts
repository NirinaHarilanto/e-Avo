import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Tarif = Database['public']['Tables']['tarifs']['Row']

export function useTarifs(etablissementId: string | undefined) {
  const [tarifs, setTarifs] = useState<Tarif[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!etablissementId) return
    setLoading(true)
    setErreur(null)
    const { data, error } = await supabase
      .from('tarifs')
      .select('*')
      .eq('etablissement_id', etablissementId)
      .order('ordre')
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }
    setTarifs(data ?? [])
    setLoading(false)
  }, [etablissementId])

  useEffect(() => {
    charger()
  }, [charger])

  return { tarifs, loading, erreur, recharger: charger }
}
