import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Profile = Database['public']['Tables']['profiles']['Row']
type TeacherAssignment = Database['public']['Tables']['teacher_assignments']['Row']
type Session = Database['public']['Tables']['sessions']['Row']
type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type DiagnosticCall = Database['public']['Tables']['diagnostic_calls']['Row']
type Package = Database['public']['Tables']['packages']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']
type Cohort = Database['public']['Tables']['cohorts']['Row']

export interface SeanceDuParcours {
  enrollment: SessionEnrollment
  session: Session
  video: VideoSession | null
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
  /* Vague (cohorte) collectif de l'étudiant, s'il en a une — sinon il est individuel/duo via
     `packages`. Pas de colonne dédiée : la présence d'une inscription à une cohorte suffit à
     distinguer les deux cas. */
  cohorte: Cohort | null
  heuresConsommees: number
  prochaineSeance: SeanceDuParcours | null
}

export function useDossierEtudiant(studentId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(studentId && `dossier-etudiant-${studentId}`, async (): Promise<DossierEtudiant> => {
    const { data: etudiant, error: etudiantError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', studentId as string)
      .single()
    if (etudiantError || !etudiant) throw new Error(etudiantError?.message ?? 'Étudiant introuvable.')

    const [{ data: affectations }, { data: enrollments }, { data: packages }, { data: resume }, { data: inscriptionCohorte }] = await Promise.all([
      supabase.from('teacher_assignments').select('*').eq('student_id', studentId as string).order('date_debut', { ascending: false }),
      supabase.from('session_enrollments').select('*').eq('student_id', studentId as string),
      supabase.from('packages').select('*').eq('student_id', studentId as string).order('created_at', { ascending: false }),
      supabase.from('student_hours_summary').select('*').eq('student_id', studentId as string).maybeSingle(),
      supabase.from('cohort_enrollments').select('cohort_id').eq('student_id', studentId as string).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const cohorte = inscriptionCohorte
      ? (await supabase.from('cohorts').select('*').eq('id', inscriptionCohorte.cohort_id).maybeSingle()).data
      : null

    const sessionIds = [...new Set((enrollments ?? []).map((e) => e.session_id))]
    const [{ data: sessions }, { data: videos }] =
      sessionIds.length > 0
        ? await Promise.all([
            supabase.from('sessions').select('*').in('id', sessionIds),
            supabase.from('video_sessions').select('*').in('session_id', sessionIds),
          ])
        : [{ data: [] as Session[] }, { data: [] as VideoSession[] }]
    const sessionParId = new Map((sessions ?? []).map((s) => [s.id, s]))
    const videoParSession = new Map((videos ?? []).map((v) => [v.session_id, v]))

    const teacherIds = [...new Set((affectations ?? []).map((a) => a.teacher_id))]
    const { data: professeurs } =
      teacherIds.length > 0
        ? await supabase.from('profiles').select('*').in('id', teacherIds)
        : { data: [] as Profile[] }
    const professeurParId = new Map((professeurs ?? []).map((p) => [p.id, p]))

    const seancesToutes: SeanceDuParcours[] = (enrollments ?? [])
      .map((enrollment) => {
        const session = sessionParId.get(enrollment.session_id)
        return session ? { enrollment, session, video: videoParSession.get(enrollment.session_id) ?? null } : null
      })
      .filter((v): v is SeanceDuParcours => v !== null)

    const periodes: PeriodeProfesseur[] = (affectations ?? []).map((affectation) => ({
      affectation,
      professeur: professeurParId.get(affectation.teacher_id) ?? null,
      // Chronologique, de la première séance à la dernière — cohérent avec tous les autres
      // plannings de l'app (voir CalendrierProfesseur.tsx, SeancesAdmin.tsx).
      seances: seancesToutes
        .filter((s) => s.enrollment.teacher_assignment_id === affectation.id)
        .sort((a, b) => a.session.debut.localeCompare(b.session.debut)),
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

    return {
      etudiant,
      periodes,
      diagnostic,
      packages: packages ?? [],
      cohorte: cohorte ?? null,
      heuresConsommees: resume?.heures_consommees ?? 0,
      prochaineSeance,
    }
  })

  return { dossier: valeur ?? null, loading, erreur, recharger }
}
