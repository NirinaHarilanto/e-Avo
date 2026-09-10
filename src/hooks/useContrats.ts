import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Contract = Database['public']['Tables']['contracts']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface ContratAvecDestinataire {
  contrat: Contract
  destinataire: Profile | null
}

export function useContrats() {
  const [contrats, setContrats] = useState<ContratAvecDestinataire[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    setErreur(null)

    const { data, error } = await supabase.from('contracts').select('*').order('created_at', { ascending: false })
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }

    const profileIds = [...new Set((data ?? []).map((c) => c.destinataire_profile_id))]
    const { data: profils } = profileIds.length
      ? await supabase.from('profiles').select('*').in('id', profileIds)
      : { data: [] as Profile[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

    setContrats((data ?? []).map((c) => ({ contrat: c, destinataire: profilParId.get(c.destinataire_profile_id) ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { contrats, loading, erreur, recharger: charger }
}
