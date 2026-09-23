import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'
import { inscriptionsVisibles } from '../lib/seances'

type Session = Database['public']['Tables']['sessions']['Row']
type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']

export interface SeanceAdmin {
  session: Session
  professeur: Profile | null
  inscriptions: (SessionEnrollment & { etudiant: Profile | null })[]
  video: VideoSession | null
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

    const [{ data: enrollments }, { data: professeurs }, { data: videos }] = await Promise.all([
      sessionIds.length ? supabase.from('session_enrollments').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as SessionEnrollment[] }),
      // Un professeur supprimé disparaît de son propre nom sur la séance — la séance elle-même
      // reste visible, c'est l'historique de l'élève qui la concerne (demande client du
      // 2026-09-23).
      teacherIds.length ? supabase.from('profiles').select('*').in('id', teacherIds).neq('status', 'suspended') : Promise.resolve({ data: [] as Profile[] }),
      sessionIds.length ? supabase.from('video_sessions').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as VideoSession[] }),
    ])

    const studentIds = [...new Set((enrollments ?? []).map((e) => e.student_id))]
    const { data: etudiants } = studentIds.length
      ? await supabase.from('profiles').select('*').in('id', studentIds).neq('status', 'suspended')
      : { data: [] as Profile[] }

    const profParId = new Map((professeurs ?? []).map((p) => [p.id, p]))
    const videoParSession = new Map((videos ?? []).map((v) => [v.session_id, v]))
    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))

    return (sessions ?? []).flatMap((session): SeanceAdmin[] => {
      const inscriptions = (enrollments ?? [])
        .filter((e) => e.session_id === session.id)
        .map((e) => ({ ...e, etudiant: etudiantParId.get(e.student_id) ?? null }))
      const visibles = inscriptionsVisibles(inscriptions)
      if (!visibles) return []
      return [{
        session,
        professeur: profParId.get(session.teacher_id) ?? null,
        inscriptions: visibles,
        video: videoParSession.get(session.id) ?? null,
      }]
    })
  })

  return { seances: valeur ?? [], loading, erreur, recharger }
}
