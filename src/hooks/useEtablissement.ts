import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Utilisé par ProfileProvider (une fois par session) et par les vues imprimables (devis/
   facture/contrat) pour l'en-tête — plusieurs composants demandent donc le même établissement
   en parallèle. Passer par le cache partagé (`useCacheRequete`) évite d'y refaire la même
   requête Supabase à chaque vue imprimable ouverte, en plus d'éviter le rechargement au retour
   sur une page déjà visitée. */
export function useEtablissement(etablissementId: string | undefined) {
  const { valeur } = useCacheRequete(etablissementId && `etablissement-${etablissementId}`, async () => {
    const { data } = await supabase.from('etablissements').select('*').eq('id', etablissementId as string).maybeSingle()
    return data as Etablissement | null
  })

  return valeur ?? null
}
