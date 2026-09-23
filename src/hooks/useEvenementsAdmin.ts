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
    // Un participant supprimé disparaît du rendez-vous (demande client du 2026-09-23) —
    // passé compris : la ligne reste en base, réversible si la personne se réinscrit.
    const { data: profils } = tousLesIds.length
      ? await supabase.from('profiles').select('id, nom, prenom, role').in('id', tousLesIds).neq('status', 'suspended')
      : { data: [] as ParticipantEvenement[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

    return (evenements ?? [])
      .map((e): EvenementAdminAvecParticipants => ({
        ...e,
        obligatoires: e.participants_obligatoires.map((id) => profilParId.get(id)).filter((p): p is ParticipantEvenement => !!p),
        optionnels: e.participants_optionnels.map((id) => profilParId.get(id)).filter((p): p is ParticipantEvenement => !!p),
      }))
      // Un rendez-vous qui n'a plus personne (tous les participants supprimés) n'a plus rien à
      // montrer — il disparaît de l'agenda plutôt que d'apparaître vide.
      .filter((e) => e.obligatoires.length + e.optionnels.length > 0)
  })

  return { evenements: valeur ?? [], loading, erreur, recharger }
}
