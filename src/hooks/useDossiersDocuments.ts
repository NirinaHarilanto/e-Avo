import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type DossierDocument = Database['public']['Tables']['document_dossiers']['Row']

/* Arborescence documentaire d'une personne (0058). Tous ses dossiers sont chargés d'un coup
   plutôt qu'un niveau à la fois : une arborescence personnelle se compte en dizaines de lignes,
   et la charger entièrement permet de construire le fil d'Ariane et les sous-dossiers sans une
   requête par clic. La RLS filtre déjà selon qui regarde (propriétaire, professeur de l'élève,
   admin de l'établissement) — mêmes règles que `documents`. */
export type PorteeDossiers = 'personnelle' | 'etablissement'

export function useDossiersDocuments(proprietaireProfileId: string | undefined, portee: PorteeDossiers = 'personnelle') {
  /* Deux arborescences distinctes dans la même table (0149) : celle d'une personne, et la
     bibliothèque commune des documents partageables, qui n'appartient à personne en particulier
     et que tous les admins alimentent. Deux clés de cache séparées, sinon l'une servirait les
     dossiers de l'autre. */
  const commune = portee === 'etablissement'
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    commune ? 'dossiers-documents-etablissement' : proprietaireProfileId && `dossiers-documents-${proprietaireProfileId}`,
    async () => {
      const requete = supabase.from('document_dossiers').select('*')
      const { data, error } = await (commune
        ? requete.eq('etablissement_wide', true)
        : requete.eq('etablissement_wide', false).eq('proprietaire_profile_id', proprietaireProfileId as string)
      ).order('nom')
      if (error) throw new Error(error.message)
      return data ?? []
    },
  )

  return { dossiers: valeur ?? ([] as DossierDocument[]), loading, erreur, recharger }
}

/* Chemin de la racine jusqu'au dossier courant, pour le fil d'Ariane. Remonte par `parent_id`
   avec une borne de sécurité : la base interdit déjà les cycles (trigger de 0058), mais une
   donnée incohérente ne doit jamais figer l'interface dans une boucle infinie. */
export function cheminDossier(dossiers: DossierDocument[], dossierId: string | null): DossierDocument[] {
  const parId = new Map(dossiers.map((d) => [d.id, d]))
  const chemin: DossierDocument[] = []
  let courant = dossierId ? parId.get(dossierId) : undefined
  while (courant && chemin.length < 50) {
    chemin.unshift(courant)
    courant = courant.parent_id ? parId.get(courant.parent_id) : undefined
  }
  return chemin
}

export function sousDossiers(dossiers: DossierDocument[], parentId: string | null): DossierDocument[] {
  return dossiers.filter((d) => d.parent_id === parentId)
}
