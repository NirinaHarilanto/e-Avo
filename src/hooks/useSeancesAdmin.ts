import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Session = Database['public']['Tables']['sessions']['Row']
type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface SeanceAdmin {
  session: Session
  professeur: Profile | null
  inscriptions: (SessionEnrollment & { etudiant: Profile | null })[]
}

/* Vue globale de toutes les séances de l'établissement pour l'admin — même agrégation
   côté client que useCalendrierProfesseur.ts (pas de jointure SQL, pattern déjà établi dans
   ce projet), mais sans filtre teacher_id : la policy RLS `sessions_admin_all` s'en charge. */
export function useSeancesAdmin() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('seances-admin', async () => {
    const { data: sessions, error: sessionsError } = await supabase.from('sessions').select('*').order('debut', { ascending: false })
    if (sessionsError) throw new Error(sessionsError.message)

    const sessionIds = (sessions ?? []).map((s) => s.id)
    const teacherIds = [...new Set((sessions ?? []).map((s) => s.teacher_id))]

    const [{ data: enrollments }, { data: professeurs }] = await Promise.all([
      sessionIds.length ? supabase.from('session_enrollments').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as SessionEnrollment[] }),
      teacherIds.length ? supabase.from('profiles').select('*').in('id', teacherIds) : Promise.resolve({ data: [] as Profile[] }),
    ])

    const studentIds = [...new Set((enrollments ?? []).map((e) => e.student_id))]
    const { data: etudiants } = studentIds.length
      ? await supabase.from('profiles').select('*').in('id', studentIds)
      : { data: [] as Profile[] }

    const profParId = new Map((professeurs ?? []).map((p) => [p.id, p]))
    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))

    return (sessions ?? []).map((session): SeanceAdmin => ({
      session,
      professeur: profParId.get(session.teacher_id) ?? null,
      inscriptions: (enrollments ?? [])
        .filter((e) => e.session_id === session.id)
        .map((e) => ({ ...e, etudiant: etudiantParId.get(e.student_id) ?? null })),
    }))
  })

  return { seances: valeur ?? [], loading, erreur, recharger }
}
