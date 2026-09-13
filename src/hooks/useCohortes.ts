import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Cohort = Database['public']['Tables']['cohorts']['Row']

export function useCohortes() {
  const [cohortes, setCohortes] = useState<Cohort[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    setErreur(null)
    const { data, error } = await supabase.from('cohorts').select('*').order('date_debut', { ascending: false })
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }
    setCohortes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { cohortes, loading, erreur, recharger: charger }
}
