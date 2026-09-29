import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type Candidature = Database['public']['Tables']['candidatures_formateurs']['Row']

/* Candidatures formateurs (0082), avec pour chaque candidat entré en intégration l'état de son
   contrat : la case « Signature du contrat » de la checklist se constate sur le contrat
   lui-même, pas par une coche manuelle. */
export function useCandidatures() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('candidatures-formateurs', async () => {
    const { data, error } = await supabase.from('candidatures_formateurs').select('*').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const profIds = (data ?? []).map((c) => c.professeur_id).filter((id): id is string => !!id)
    const { data: contrats } = profIds.length
      ? await supabase.from('contracts').select('destinataire_profile_id, statut').in('destinataire_profile_id', profIds)
      : { data: [] as { destinataire_profile_id: string; statut: string }[] }
    const signes = new Set((contrats ?? []).filter((c) => c.statut === 'signe').map((c) => c.destinataire_profile_id))
    const envoyes = new Set((contrats ?? []).map((c) => c.destinataire_profile_id))
    return {
      candidatures: data ?? [],
      contratSigne: (profId: string | null) => !!profId && signes.has(profId),
      contratEnvoye: (profId: string | null) => !!profId && envoyes.has(profId),
    }
  })
  return {
    candidatures: valeur?.candidatures ?? [],
    contratSigne: valeur?.contratSigne ?? (() => false),
    contratEnvoye: valeur?.contratEnvoye ?? (() => false),
    loading,
    erreur,
    recharger,
  }
}
