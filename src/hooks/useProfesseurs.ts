import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

export function useProfesseurs() {
  const [professeurs, setProfesseurs] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let annule = false
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'professeur')
      .order('nom')
      .then(({ data }) => {
        if (annule) return
        setProfesseurs(data ?? [])
        setLoading(false)
      })
    return () => {
      annule = true
    }
  }, [])

  return { professeurs, loading }
}
