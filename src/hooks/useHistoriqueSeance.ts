import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type SessionModification = Database['public']['Tables']['session_modifications']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface ModificationSeance {
  modification: SessionModification
  auteur: Profile | null
}

/* Historique des reprogrammations/annulations d'une séance (migration 0048) — traçabilité
   demandée par le client en remplacement de la validation admin supprimée : chaque changement
   reste visible avec qui l'a fait, quand, et pourquoi, plutôt que d'être simplement appliqué en
   silence. */
export function useHistoriqueSeance(sessionId: string | undefined) {
  const { valeur, loading, erreur } = useCacheRequete(sessionId && `historique-seance-${sessionId}`, async (): Promise<ModificationSeance[]> => {
    const { data, error } = await supabase
      .from('session_modifications')
      .select('*')
      .eq('session_id', sessionId as string)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    const auteurIds = [...new Set((data ?? []).map((m) => m.modifie_par))]
    const { data: profils } = auteurIds.length
      ? await supabase.from('profiles').select('*').in('id', auteurIds)
      : { data: [] as Profile[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

    return (data ?? []).map((modification) => ({ modification, auteur: profilParId.get(modification.modifie_par) ?? null }))
  })

  return { modifications: valeur ?? [], loading, erreur }
}
