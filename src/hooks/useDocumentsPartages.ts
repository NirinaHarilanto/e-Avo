import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Document = Database['public']['Tables']['documents']['Row']
type Partage = Database['public']['Tables']['document_partages']['Row']

export interface DocumentPartage {
  document: Document
  partage: Partage
}

/* Fichiers qu'on m'a partagés (0059/0060) — ce qui alimente le dossier « Mes fichiers
   partagés ». Ce dossier n'existe pas en base : les fichiers restent dans l'arborescence de
   leur propriétaire, seule leur VUE m'est ouverte. Les recopier chez moi créerait deux
   exemplaires à maintenir et me laisserait « supprimer » le fichier de quelqu'un d'autre. */
export function useDocumentsPartages(profileId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    profileId && `documents-partages-${profileId}`,
    async (): Promise<DocumentPartage[]> => {
      const { data: partages, error } = await supabase
        .from('document_partages')
        .select('*')
        .eq('destinataire_profile_id', profileId as string)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      if (!partages || partages.length === 0) return []

      /* La RLS de `documents` (policy documents_partage_select, 0059) rend visibles exactement
         les documents partagés avec moi : un partage dont le fichier a disparu entre-temps
         ressort simplement absent de cette liste, sans erreur. */
      const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .in('id', partages.map((p) => p.document_id))
      const parId = new Map((documents ?? []).map((d) => [d.id, d]))

      return partages
        .map((partage) => {
          const document = parId.get(partage.document_id)
          return document ? { document, partage } : null
        })
        .filter((v): v is DocumentPartage => v !== null)
    },
  )

  return { partages: valeur ?? [], loading, erreur, recharger }
}
