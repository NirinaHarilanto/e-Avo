import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type TeacherAssignment = Database['public']['Tables']['teacher_assignments']['Row']
type Session = Database['public']['Tables']['sessions']['Row']
type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type DiagnosticCall = Database['public']['Tables']['diagnostic_calls']['Row']
type Package = Database['public']['Tables']['packages']['Row']

export interface SeanceDuParcours {
  enrollment: SessionEnrollment
  session: Session
}

export interface PeriodeProfesseur {
  affectation: TeacherAssignment
  professeur: Profile | null
  seances: SeanceDuParcours[]
}

export interface DossierEtudiant {
  etudiant: Profile
  periodes: PeriodeProfesseur[]
  diagnostic: DiagnosticCall | null
  packages: Package[]
  heuresConsommees: number
  prochaineSeance: SeanceDuParcours | null
}

export function useDossierEtudiant(studentId: string | undefined) {
  const [dossier, setDossier] = useState<DossierEtudiant | null>(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    setErreur(null)

    const { data: etudiant, error: etudiantError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', studentId)
      .single()

    if (etudiantError || !etudiant) {
      setErreur(etudiantError?.message ?? 'Étudiant introuvable.')
      setLoading(false)
      return
    }

    const [{ data: affectations }, { data: enrollments }, { data: packages }, { data: resume }] = await Promise.all([
      supabase.from('teacher_assignments').select('*').eq('student_id', studentId).order('date_debut', { ascending: false }),
      supabase.from('session_enrollments').select('*').eq('student_id', studentId),
      supabase.from('packages').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
      supabase.from('student_hours_summary').select('*').eq('student_id', studentId).maybeSingle(),
    ])

    const sessionIds = [...new Set((enrollments ?? []).map((e) => e.session_id))]
    const { data: sessions } =
      sessionIds.length > 0
        ? await supabase.from('sessions').select('*').in('id', sessionIds)
        : { data: [] as Session[] }
    const sessionParId = new Map((sessions ?? []).map((s) => [s.id, s]))

    const teacherIds = [...new Set((affectations ?? []).map((a) => a.teacher_id))]
    const { data: professeurs } =
      teacherIds.length > 0
        ? await supabase.from('profiles').select('*').in('id', teacherIds)
        : { data: [] as Profile[] }
    const professeurParId = new Map((professeurs ?? []).map((p) => [p.id, p]))

    const seancesToutes: SeanceDuParcours[] = (enrollments ?? [])
      .map((enrollment) => {
        const session = sessionParId.get(enrollment.session_id)
        return session ? { enrollment, session } : null
      })
      .filter((v): v is SeanceDuParcours => v !== null)

    const periodes: PeriodeProfesseur[] = (affectations ?? []).map((affectation) => ({
      affectation,
      professeur: professeurParId.get(affectation.teacher_id) ?? null,
      seances: seancesToutes
        .filter((s) => s.enrollment.teacher_assignment_id === affectation.id)
        .sort((a, b) => b.session.debut.localeCompare(a.session.debut)),
    }))

    let diagnostic: DiagnosticCall | null = null
    if (etudiant.prospect_id) {
      const { data } = await supabase
        .from('diagnostic_calls')
        .select('*')
        .eq('prospect_id', etudiant.prospect_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      diagnostic = data
    }

    const maintenant = new Date().toISOString()
    const prochaineSeance =
      seancesToutes
        .filter((s) => s.session.statut === 'planifiee' && s.session.debut >= maintenant)
        .sort((a, b) => a.session.debut.localeCompare(b.session.debut))[0] ?? null

    setDossier({
      etudiant,
      periodes,
      diagnostic,
      packages: packages ?? [],
      heuresConsommees: resume?.heures_consommees ?? 0,
      prochaineSeance,
    })
    setLoading(false)
  }, [studentId])

  useEffect(() => {
    charger()
  }, [charger])

  return { dossier, loading, erreur, recharger: charger }
}
