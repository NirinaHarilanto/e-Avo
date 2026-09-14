import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Session = Database['public']['Tables']['sessions']['Row']
type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']

export interface SeanceProfesseur {
  session: Session
  inscriptions: (SessionEnrollment & { etudiant: Profile | null })[]
  video: VideoSession | null
}

interface CalendrierProfesseur {
  seances: SeanceProfesseur[]
  etudiantsActifs: Profile[]
  heuresEnseignees: number
}

export function useCalendrierProfesseur(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(teacherId && `calendrier-professeur-${teacherId}`, async (): Promise<CalendrierProfesseur> => {
    const [{ data: sessions, error: sessionsError }, { data: affectations }, { data: resumeHeures }] = await Promise.all([
      supabase.from('sessions').select('*').eq('teacher_id', teacherId as string).order('debut', { ascending: false }),
      supabase.from('teacher_assignments').select('*').eq('teacher_id', teacherId as string).is('date_fin', null),
      supabase.from('teacher_hours_summary').select('*').eq('teacher_id', teacherId as string).maybeSingle(),
    ])
    if (sessionsError) throw new Error(sessionsError.message)

    const sessionIds = (sessions ?? []).map((s) => s.id)
    const [{ data: enrollments }, { data: videos }] = await Promise.all([
      sessionIds.length ? supabase.from('session_enrollments').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as SessionEnrollment[] }),
      sessionIds.length ? supabase.from('video_sessions').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as VideoSession[] }),
    ])

    const studentIds = [...new Set([...(enrollments ?? []).map((e) => e.student_id), ...(affectations ?? []).map((a) => a.student_id)])]
    const { data: etudiants } = studentIds.length
      ? await supabase.from('profiles').select('*').in('id', studentIds)
      : { data: [] as Profile[] }
    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))
    const videoParSession = new Map((videos ?? []).map((v) => [v.session_id, v]))

    return {
      seances: (sessions ?? []).map((session) => ({
        session,
        inscriptions: (enrollments ?? [])
          .filter((e) => e.session_id === session.id)
          .map((e) => ({ ...e, etudiant: etudiantParId.get(e.student_id) ?? null })),
        video: videoParSession.get(session.id) ?? null,
      })),
      etudiantsActifs: (affectations ?? []).map((a) => etudiantParId.get(a.student_id)).filter((e): e is Profile => !!e),
      heuresEnseignees: resumeHeures?.heures_enseignees ?? 0,
    }
  })

  return {
    seances: valeur?.seances ?? [],
    etudiantsActifs: valeur?.etudiantsActifs ?? [],
    heuresEnseignees: valeur?.heuresEnseignees ?? 0,
    loading,
    erreur,
    recharger,
  }
}
