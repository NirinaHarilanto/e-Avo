import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Document = Database['public']['Tables']['documents']['Row']

/* Documents appartenant à un profil donné (étudiant ou professeur) — RLS (migration 0018)
   filtre déjà selon qui regarde : propriétaire, uploadeur, professeur de l'élève, ou admin
   de l'établissement. Même pattern que useEtudiants.ts/useProfesseurs.ts. */
export function useDocuments(ownerProfileId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(ownerProfileId && `documents-${ownerProfileId}`, async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('owner_profile_id', ownerProfileId as string)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { documents: valeur ?? ([] as Document[]), loading, erreur, recharger }
}
