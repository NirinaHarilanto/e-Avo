import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Profile = Database['public']['Tables']['profiles']['Row']

/* Admins d'un établissement donné — nécessite la policy profiles_plateforme_select
   (migration 0022), qui n'ouvre la lecture de `profiles` tous établissements confondus qu'à
   un admin plateforme. */
export function useAdminsEtablissement(etablissementId: string | undefined) {
  const { valeur, loading, recharger } = useCacheRequete(etablissementId && `admins-etablissement-${etablissementId}`, async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('etablissement_id', etablissementId as string)
      .eq('role', 'admin_etablissement')
      .order('nom')
    return data ?? []
  })

  return { admins: valeur ?? ([] as Profile[]), loading, recharger }
}
