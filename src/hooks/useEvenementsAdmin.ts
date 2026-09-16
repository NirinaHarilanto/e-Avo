import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type EvenementAdmin = Database['public']['Tables']['evenements_admin']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export type ParticipantEvenement = Pick<Profile, 'id' | 'nom' | 'prenom' | 'role'>

export interface EvenementAdminAvecParticipants extends EvenementAdmin {
  obligatoires: ParticipantEvenement[]
  optionnels: ParticipantEvenement[]
}

/** Rendez-vous créés directement par l'admin (voir api/admin/creer-evenement.ts), avec leurs
    participants résolus en profils affichables — `participants_obligatoires`/`participants_optionnels`
    ne portent que des identifiants, jamais lus par une jointure PostgREST classique puisque ce
    sont de simples tableaux, pas des clés étrangères. Le rôle de chacun (déjà inclus dans le
    profil résolu) sert ensuite à déterminer la couleur de la pastille dans l'agenda — voir
    RendezVousAdmin.tsx. */
export function useEvenementsAdmin() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('evenements-admin', async () => {
    const { data: evenements, error } = await supabase.from('evenements_admin').select('*').order('debut', { ascending: true })
    if (error) throw new Error(error.message)

    const tousLesIds = [...new Set((evenements ?? []).flatMap((e) => [...e.participants_obligatoires, ...e.participants_optionnels]))]
    const { data: profils } = tousLesIds.length
      ? await supabase.from('profiles').select('id, nom, prenom, role').in('id', tousLesIds)
      : { data: [] as ParticipantEvenement[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

    return (evenements ?? []).map((e): EvenementAdminAvecParticipants => ({
      ...e,
      obligatoires: e.participants_obligatoires.map((id) => profilParId.get(id)).filter((p): p is ParticipantEvenement => !!p),
      optionnels: e.participants_optionnels.map((id) => profilParId.get(id)).filter((p): p is ParticipantEvenement => !!p),
    }))
  })

  return { evenements: valeur ?? [], loading, erreur, recharger }
}
