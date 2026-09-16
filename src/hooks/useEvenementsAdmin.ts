import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type EvenementAdmin = Database['public']['Tables']['evenements_admin']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface EvenementAdminAvecParticipants extends EvenementAdmin {
  etudiants: Pick<Profile, 'id' | 'nom' | 'prenom'>[]
  professeurs: Pick<Profile, 'id' | 'nom' | 'prenom'>[]
}

/** Rendez-vous créés directement par l'admin (voir api/admin/creer-evenement.ts), avec leurs
    participants résolus en noms affichables — `student_ids`/`teacher_ids` ne portent que des
    identifiants, jamais lus par une jointure PostgREST classique puisque ce sont de simples
    tableaux, pas des clés étrangères. */
export function useEvenementsAdmin() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('evenements-admin', async () => {
    const { data: evenements, error } = await supabase.from('evenements_admin').select('*').order('debut', { ascending: true })
    if (error) throw new Error(error.message)

    const tousLesIds = [...new Set((evenements ?? []).flatMap((e) => [...e.student_ids, ...e.teacher_ids]))]
    const { data: profils } = tousLesIds.length
      ? await supabase.from('profiles').select('id, nom, prenom').in('id', tousLesIds)
      : { data: [] as Pick<Profile, 'id' | 'nom' | 'prenom'>[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

    return (evenements ?? []).map((e): EvenementAdminAvecParticipants => ({
      ...e,
      etudiants: e.student_ids.map((id) => profilParId.get(id)).filter((p): p is Profile => !!p),
      professeurs: e.teacher_ids.map((id) => profilParId.get(id)).filter((p): p is Profile => !!p),
    }))
  })

  return { evenements: valeur ?? [], loading, erreur, recharger }
}
