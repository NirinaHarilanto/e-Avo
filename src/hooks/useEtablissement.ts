import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Utilisé par les vues imprimables (devis/facture/contrat) pour l'en-tête — même requête que
   celle déjà faite inline dans EspaceLayout.tsx, extraite ici pour être réutilisée à 3 endroits
   sans dupliquer l'appel Supabase. */
export function useEtablissement(etablissementId: string | undefined) {
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)

  useEffect(() => {
    if (!etablissementId) return
    supabase
      .from('etablissements')
      .select('*')
      .eq('id', etablissementId)
      .maybeSingle()
      .then(({ data }) => setEtablissement(data))
  }, [etablissementId])

  return etablissement
}
