import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Contract = Database['public']['Tables']['contracts']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface ContratAvecDestinataire {
  contrat: Contract
  destinataire: Profile | null
  // Profil de la personne qui a signé pour l'établissement (contrat.signe_etablissement_par) —
  // utilisé pour afficher son image de signature sur ContratImprimable.tsx (demande client du
  // 2026-09-17). Null tant que personne n'a encore signé côté établissement.
  signataireEtablissement: Profile | null
}

export function useContrats() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('contrats', async () => {
    const { data, error } = await supabase.from('contracts').select('*').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    const profileIds = [
      ...new Set([
        ...(data ?? []).map((c) => c.destinataire_profile_id),
        ...(data ?? []).map((c) => c.signe_etablissement_par).filter((id): id is string => !!id),
      ]),
    ]
    const { data: profils } = profileIds.length
      ? await supabase.from('profiles').select('*').in('id', profileIds)
      : { data: [] as Profile[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

    return (data ?? []).map(
      (c): ContratAvecDestinataire => ({
        contrat: c,
        destinataire: profilParId.get(c.destinataire_profile_id) ?? null,
        signataireEtablissement: c.signe_etablissement_par ? profilParId.get(c.signe_etablissement_par) ?? null : null,
      }),
    )
  })

  return { contrats: valeur ?? [], loading, erreur, recharger }
}
