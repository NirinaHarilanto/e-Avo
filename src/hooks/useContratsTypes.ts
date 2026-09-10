import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type ContractTemplate = Database['public']['Tables']['contract_templates']['Row']

export function useContratsTypes() {
  const [modeles, setModeles] = useState<ContractTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    setErreur(null)
    const { data, error } = await supabase.from('contract_templates').select('*').order('nom')
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }
    setModeles(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { modeles, loading, erreur, recharger: charger }
}
