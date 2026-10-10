import { supabase } from '../lib/supabaseClient'
import { useCacheRequete } from './useCacheRequete'

/* Catégories de document « personnalisées » de l'établissement (0109, demande client du
   2026-10-10 : « rajoute un bouton pour pouvoir rajouter une catégorie dans la liste
   déroulante »). Aucune table de référence dédiée : une catégorie personnalisée n'est, en base,
   qu'un document `categorie = 'autre'` portant un `categorie_libre` — la liste déroulante se
   construit donc en relisant les libellés déjà utilisés par l'établissement, dédupliqués, plutôt
   que depuis un catalogue à gérer à part. Une requête groupée, pas une par document (même
   principe que `useTypesProgrammeEtudiants`). */
export function useCategoriesDocumentsPersonnalisees(etablissementId: string | undefined) {
  const { valeur, loading, recharger } = useCacheRequete(
    etablissementId ? `categories-documents-libres-${etablissementId}` : null,
    async () => {
      const { data } = await supabase
        .from('documents')
        .select('categorie_libre')
        .eq('etablissement_id', etablissementId as string)
        .eq('categorie', 'autre')
        .not('categorie_libre', 'is', null)
      const libelles = new Set<string>()
      for (const ligne of data ?? []) {
        if (ligne.categorie_libre) libelles.add(ligne.categorie_libre)
      }
      return [...libelles].sort((a, b) => a.localeCompare(b, 'fr'))
    },
  )
  return { categoriesPersonnalisees: valeur ?? [], loading, recharger }
}
