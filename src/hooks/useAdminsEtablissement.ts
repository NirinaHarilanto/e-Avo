import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

/* Admins d'un établissement donné — nécessite la policy profiles_plateforme_select
   (migration 0022), qui n'ouvre la lecture de `profiles` tous établissements confondus qu'à
   un admin plateforme. */
export function useAdminsEtablissement(etablissementId: string | undefined) {
  const [admins, setAdmins] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const charger = useCallback(async () => {
    if (!etablissementId) return
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('etablissement_id', etablissementId)
      .eq('role', 'admin_etablissement')
      .order('nom')
    setAdmins(data ?? [])
    setLoading(false)
  }, [etablissementId])

  useEffect(() => {
    charger()
  }, [charger])

  return { admins, loading, recharger: charger }
}
