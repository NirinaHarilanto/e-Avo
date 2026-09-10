import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Session = Database['public']['Tables']['sessions']['Row']
type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']

export interface SeanceProfesseur {
  session: Session
  inscriptions: (SessionEnrollment & { etudiant: Profile | null })[]
  video: VideoSession | null
}

export function useCalendrierProfesseur(teacherId: string | undefined) {
  const [seances, setSeances] = useState<SeanceProfesseur[]>([])
  const [etudiantsActifs, setEtudiantsActifs] = useState<Profile[]>([])
  const [heuresEnseignees, setHeuresEnseignees] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!teacherId) return
    setLoading(true)
    setErreur(null)

    const [{ data: sessions, error: sessionsError }, { data: affectations }, { data: resumeHeures }] = await Promise.all([
      supabase.from('sessions').select('*').eq('teacher_id', teacherId).order('debut', { ascending: false }),
      supabase.from('teacher_assignments').select('*').eq('teacher_id', teacherId).is('date_fin', null),
      supabase.from('teacher_hours_summary').select('*').eq('teacher_id', teacherId).maybeSingle(),
    ])
    setHeuresEnseignees(resumeHeures?.heures_enseignees ?? 0)

    if (sessionsError) {
      setErreur(sessionsError.message)
      setLoading(false)
      return
    }

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

    setSeances(
      (sessions ?? []).map((session) => ({
        session,
        inscriptions: (enrollments ?? [])
          .filter((e) => e.session_id === session.id)
          .map((e) => ({ ...e, etudiant: etudiantParId.get(e.student_id) ?? null })),
        video: videoParSession.get(session.id) ?? null,
      })),
    )
    setEtudiantsActifs((affectations ?? []).map((a) => etudiantParId.get(a.student_id)).filter((e): e is Profile => !!e))
    setLoading(false)
  }, [teacherId])

  useEffect(() => {
    charger()
  }, [charger])

  return { seances, etudiantsActifs, heuresEnseignees, loading, erreur, recharger: charger }
}
