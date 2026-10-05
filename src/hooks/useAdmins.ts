import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Profile = Database['public']['Tables']['profiles']['Row']

/* Équipe d'administrateurs de l'établissement (0097, demande client du 2026-10-05 : « plusieurs
   profils admin ajoutable depuis l'espace admin [...] accès de plusieurs admin sur le même
   espace admin unique »). Même modèle que `useProfesseurs` : la RLS (`profiles_admin_select_
   etablissement`, 0004) laisse déjà n'importe quel admin voir tous les profils de son
   établissement, autres admins compris — aucune policy nouvelle n'était nécessaire, seul un
   écran manquait pour les inviter et les gérer depuis l'espace admin lui-même plutôt que depuis
   la console « Admin plateforme », à part. */
export function useAdmins() {
  const { valeur, loading, recharger } = useCacheRequete('admins-etablissement', async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'admin_etablissement').neq('status', 'suspended').order('created_at')
    return data ?? []
  })

  return { admins: valeur ?? ([] as Profile[]), loading, recharger }
}
