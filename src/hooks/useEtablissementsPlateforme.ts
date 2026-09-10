import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

export function useEtablissementsPlateforme() {
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [loading, setLoading] = useState(true)

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('etablissements').select('*').order('nom')
    setEtablissements(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { etablissements, loading, recharger: charger }
}
