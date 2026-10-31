import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type DossierPartage = Database['public']['Tables']['document_dossier_partages']['Row']
type Dossier = Database['public']['Tables']['document_dossiers']['Row']

export interface DossierRecu {
  dossier: Dossier
  partage: DossierPartage
}

/* Dossiers qu'on m'a partagés (0155), avec toute leur descendance — l'équivalent d'un dossier
   réseau monté dans son propre explorateur.

   La descendance est chargée niveau par niveau plutôt qu'en une requête : PostgREST ne sait pas
   faire de récursif, et charger « tous les dossiers visibles » pour filtrer ensuite côté client
   ramènerait, pour un admin, l'intégralité de l'établissement. Une arborescence partagée se
   compte en trois ou quatre niveaux, donc trois ou quatre requêtes bornées — et la borne de 12
   tours protège d'une donnée incohérente, jamais atteinte en usage normal. */
export function useDossiersPartages(profileId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    profileId && `dossiers-partages-${profileId}`,
    async () => {
      const { data: partages, error } = await supabase
        .from('document_dossier_partages')
        .select('*')
        .eq('destinataire_profile_id', profileId as string)
      /* `42P01` = la table n'existe pas encore. Les migrations de ce projet sont appliquées à la
         main par le client : entre le déploiement du code et son passage dans l'éditeur SQL, il y
         a toujours une fenêtre où cette table manque. Traitée comme « aucun dossier partagé »
         plutôt qu'en erreur — l'espace documentaire doit rester utilisable pendant ce délai, et
         un bandeau rouge y serait incompréhensible pour l'utilisateur. */
      if (error?.code === '42P01') return { racines: [] as DossierRecu[], descendance: [] as Dossier[] }
      if (error) throw new Error(error.message)
      if (!partages?.length) return { racines: [] as DossierRecu[], descendance: [] as Dossier[] }

      const { data: dossiersRacines, error: erreurRacines } = await supabase
        .from('document_dossiers')
        .select('*')
        .in('id', partages.map((p) => p.dossier_id))
      if (erreurRacines) throw new Error(erreurRacines.message)

      const parDossierId = new Map(partages.map((p) => [p.dossier_id, p]))
      const racines = (dossiersRacines ?? [])
        .map((dossier) => ({ dossier, partage: parDossierId.get(dossier.id)! }))
        .filter((r) => r.partage)

      const descendance: Dossier[] = []
      let niveau = racines.map((r) => r.dossier.id)
      for (let tour = 0; tour < 12 && niveau.length > 0; tour += 1) {
        const { data: enfants } = await supabase.from('document_dossiers').select('*').in('parent_id', niveau)
        if (!enfants?.length) break
        descendance.push(...enfants)
        niveau = enfants.map((e) => e.id)
      }

      return { racines, descendance }
    },
  )

  return {
    racines: valeur?.racines ?? [],
    descendance: valeur?.descendance ?? [],
    loading,
    erreur,
    recharger,
  }
}
