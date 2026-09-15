import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type RendezVous = Database['public']['Tables']['rendez_vous']['Row']
type Prospect = Database['public']['Tables']['prospects']['Row']

export interface RendezVousAvecProspect extends RendezVous {
  prospects: Pick<Prospect, 'nom' | 'prenom' | 'email' | 'telephone' | 'langue_visee' | 'objectif' | 'type_programme'> | null
}

/** Demandes d'appel diagnostic, les plus proches d'abord — c'est l'ordre dans lequel l'admin doit
    les traiter, une demande pour demain étant plus urgente qu'une demande pour dans trois
    semaines. */
export function useRendezVous() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('rendez-vous', async () => {
    const { data, error } = await supabase
      .from('rendez_vous')
      .select('*, prospects(nom, prenom, email, telephone, langue_visee, objectif, type_programme)')
      .order('debut', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as RendezVousAvecProspect[]
  })

  return { rendezVous: valeur ?? [], loading, erreur, recharger }
}

export function useDisponibilites() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('disponibilites', async () => {
    const [plages, parametres] = await Promise.all([
      supabase.from('creneaux_disponibilites').select('*').order('jour_semaine').order('heure_debut'),
      supabase.from('reservation_parametres').select('*').maybeSingle(),
    ])
    if (plages.error) throw new Error(plages.error.message)
    if (parametres.error) throw new Error(parametres.error.message)
    return { plages: plages.data ?? [], parametres: parametres.data }
  })

  return {
    plages: valeur?.plages ?? [],
    parametres: valeur?.parametres ?? null,
    loading,
    erreur,
    recharger,
  }
}
