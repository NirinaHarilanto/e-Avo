import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Document = Database['public']['Tables']['documents']['Row']

/* Documents marqués « partageables » (`etablissement_wide`, 0033) — à l'usage de
   l'ADMINISTRATION SEULE, pour choisir parmi eux la pièce jointe automatique d'un modèle
   d'e-mail (voir messages/TemplatesEmails.tsx, 0152).

   N'ouvre PLUS la bibliothèque commune aux élèves et aux professeurs : une policy qui le
   permettait brièvement (`documents_etablissement_wide_select`, 0033) a été retirée le
   2026-10-31 — le client a corrigé l'exigence de base, capture à l'appui : un fichier déposé
   dans Documents › Partageables reste dans l'espace de son déposant tant qu'il n'a pas été
   PARTAGÉ nommément (0111), jamais visible de tout l'établissement d'un coup. Ce hook continue
   de fonctionner pour un admin uniquement parce que `documents_admin_all` (0018) donne déjà à
   tout admin de l'établissement l'accès à tout document de l'établissement, indépendamment de
   `etablissement_wide` — ne JAMAIS le réutiliser pour un écran élève ou professeur. */
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
