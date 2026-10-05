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

/* CIN de la directrice, à afficher sur facture/devis/reçu (0099, demande client du 2026-10-05).
   Lu depuis `etablissement_cin_directrice`, pas depuis `etablissements` : contrairement au reste
   du Profil HOC, le CIN n'est PAS public (c'est une pièce d'identité personnelle) — cette vue ne
   l'ouvre qu'aux personnes authentifiées de l'établissement, voir la migration. `null` aussi bien
   avant chargement que si rien n'est renseigné : l'appelant (MentionsEtablissement) traite les
   deux cas de la même façon (la ligne CIN n'apparaît simplement pas). */
export function useCinDirectrice(etablissementId: string | undefined) {
  const { valeur } = useCacheRequete(etablissementId && `cin-directrice-${etablissementId}`, async () => {
    const { data } = await supabase.from('etablissement_cin_directrice').select('cin_directrice').eq('etablissement_id', etablissementId as string).maybeSingle()
    return data?.cin_directrice ?? null
  })

  return valeur ?? null
}
