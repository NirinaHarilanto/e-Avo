import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Document = Database['public']['Tables']['documents']['Row']

/* Documents appartenant à un profil donné (étudiant ou professeur) — RLS (migration 0018)
   filtre déjà selon qui regarde : propriétaire, uploadeur, professeur de l'élève, ou admin
   de l'établissement. Même pattern que useEtudiants.ts/useProfesseurs.ts. */
export function useDocuments(ownerProfileId: string | undefined) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!ownerProfileId) return
    setLoading(true)
    setErreur(null)
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('owner_profile_id', ownerProfileId)
      .order('created_at', { ascending: false })
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }
    setDocuments(data ?? [])
    setLoading(false)
  }, [ownerProfileId])

  useEffect(() => {
    charger()
  }, [charger])

  return { documents, loading, erreur, recharger: charger }
}
