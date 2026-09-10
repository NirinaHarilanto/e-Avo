import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

export function useProfesseurs() {
  const [professeurs, setProfesseurs] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('role', 'professeur').order('nom')
    setProfesseurs(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { professeurs, loading, recharger: charger }
}
