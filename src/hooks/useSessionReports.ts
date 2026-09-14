import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type SessionReport = Database['public']['Tables']['session_reports']['Row']
type Session = Database['public']['Tables']['sessions']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface CompteRenduComplet {
  rapport: SessionReport
  session: Session | null
  professeur: Profile | null
  participants: Profile[]
}

/* Comptes rendus de cours — RLS (0033) filtre déjà selon qui regarde (admin de
   l'établissement, professeur auteur, ou étudiant ayant participé à la séance) : une seule
   requête `select *` suffit, pas besoin de la scoper explicitement ici. */
export function useSessionReports() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('session-reports', async () => {
    const { data: rapports, error } = await supabase.from('session_reports').select('*').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    const sessionIds = [...new Set((rapports ?? []).map((r) => r.session_id))]
    const [{ data: sessions }, { data: enrollments }] = await Promise.all([
      sessionIds.length ? supabase.from('sessions').select('*').in('id', sessionIds) : Promise.resolve({ data: [] as Session[] }),
      sessionIds.length
        ? supabase.from('session_enrollments').select('session_id, student_id').in('session_id', sessionIds)
        : Promise.resolve({ data: [] as { session_id: string; student_id: string }[] }),
    ])
    const sessionParId = new Map((sessions ?? []).map((s) => [s.id, s]))

    const profileIds = [
      ...new Set([...(rapports ?? []).map((r) => r.teacher_id), ...(enrollments ?? []).map((e) => e.student_id)]),
    ]
    const { data: profils } = profileIds.length
      ? await supabase.from('profiles').select('*').in('id', profileIds)
      : { data: [] as Profile[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

    return (rapports ?? []).map((rapport): CompteRenduComplet => ({
      rapport,
      session: sessionParId.get(rapport.session_id) ?? null,
      professeur: profilParId.get(rapport.teacher_id) ?? null,
      participants: (enrollments ?? [])
        .filter((e) => e.session_id === rapport.session_id)
        .map((e) => profilParId.get(e.student_id))
        .filter((p): p is Profile => !!p),
    }))
  })

  return { comptesRendus: valeur ?? [], loading, erreur, recharger }
}
