import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Document = Database['public']['Tables']['documents']['Row']

/* Bibliothèque commune de l'établissement : les documents marqués « partageables »
   (`etablissement_wide`, 0033), que l'administration dépose depuis Documents › Partageables.
   La RLS les ouvre depuis le début à tout l'établissement (`documents_etablissement_wide_select`)
   mais aucun écran ne les listait côté élève ni côté professeur — ils n'étaient atteignables
   qu'en étant partagés nommément. Demande client du 2026-10-31 : les mêmes dossiers doivent se
   parcourir dans les trois espaces.

   Volontairement pas filtré par `etablissement_id` ici : la policy ne laisse de toute façon
   passer que l'établissement de la personne connectée, et un filtre de plus donnerait l'illusion
   que c'est l'écran qui protège la donnée. */
export function useDocumentsEtablissement() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('documents-etablissement', async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('etablissement_wide', true)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { documents: valeur ?? ([] as Document[]), loading, erreur, recharger }
}
