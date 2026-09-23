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

export interface EtudiantAncien {
  profil: Profile
  transfereLe: string
}

interface CalendrierProfesseur {
  seances: SeanceProfesseur[]
  etudiantsActifs: Profile[]
  /* Élèves transférés à un autre professeur (demande client du 2026-09-17) : approche additive,
     PAS une liste unifiée avec un champ statut — `etudiantsActifs` a 3 autres consommateurs
     (CalendrierProfesseur.tsx, PlanningPrevisionnelProfesseur.tsx, DocumentsProfesseur.tsx) qui
     doivent continuer à EXCLURE les anciens élèves pour planifier/afficher des documents ; une
     forme unifiée casserait silencieusement ce filtrage si le champ n'était pas repris partout. */
  etudiantsAnciens: EtudiantAncien[]
  heuresEnseignees: number
}

export function useCalendrierProfesseur(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(teacherId && `calendrier-professeur-${teacherId}`, async (): Promise<CalendrierProfesseur> => {
    const [{ data: sessions, error: sessionsError }, { data: affectations }, { data: resumeHeures }] = await Promise.all([
      supabase.from('sessions').select('*').eq('teacher_id', teacherId as string).order('debut', { ascending: false }),
      // Tout l'historique, actives ET closes (pas de .is('date_fin', null)) : profils_teacher_
      // select_students (0017) n'a jamais filtré sur date_fin, un ancien élève reste lisible par
      // l'ancien professeur indéfiniment — nécessaire pour construire etudiantsAnciens ci-dessous.
      supabase.from('teacher_assignments').select('*').eq('teacher_id', teacherId as string),
      supabase.from('teacher_hours_summary').select('*').eq('teacher_id', teacherId as string).maybeSingle(),
    ])
    if (sessionsError) throw new Error(sessionsError.message)

    const sessionIds = (sessions ?? []).map((s) => s.id)
    const [{ data: enrollments }, { data: videos }] = await Promise.all([
      sessionIds.length ? supabase.from('session_enrollments').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as SessionEnrollment[] }),
      sessionIds.length ? supabase.from('video_sessions').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as VideoSession[] }),
    ])

    const studentIds = [...new Set([...(enrollments ?? []).map((e) => e.student_id), ...(affectations ?? []).map((a) => a.student_id)])]
    // Un élève supprimé (soft-delete) garde son `teacher_assignments`/`session_enrollments`
    // historique — sans ce filtre il continuait à apparaître comme élève actif (ou ancien élève)
    // du professeur alors que son compte n'existe plus (demande client du 2026-09-23).
    const { data: etudiants } = studentIds.length
      ? await supabase.from('profiles').select('*').in('id', studentIds).neq('status', 'suspended')
      : { data: [] as Profile[] }
    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))
    const videoParSession = new Map((videos ?? []).map((v) => [v.session_id, v]))

    // Regroupe par élève : actif si au moins une affectation active avec CE professeur (prime
    // toujours, y compris si l'élève a AUSSI une ou plusieurs périodes closes avec lui — cas
    // d'un élève revenu après un transfert). Sinon ancien, avec la date de fin la plus récente.
    const parEtudiant = new Map<string, { actif: boolean; derniereFin: string | null }>()
    for (const a of affectations ?? []) {
      const entree = parEtudiant.get(a.student_id) ?? { actif: false, derniereFin: null }
      if (a.date_fin === null) entree.actif = true
      else if (!entree.derniereFin || a.date_fin > entree.derniereFin) entree.derniereFin = a.date_fin
      parEtudiant.set(a.student_id, entree)
    }

    return {
      seances: (sessions ?? []).map((session) => ({
        session,
        inscriptions: (enrollments ?? [])
          .filter((e) => e.session_id === session.id)
          .map((e) => ({ ...e, etudiant: etudiantParId.get(e.student_id) ?? null })),
        video: videoParSession.get(session.id) ?? null,
      })),
      /* Dédupliqué par élève, pas par affectation : cette liste alimente « Mes étudiants » et
         les pastilles de sélection du formulaire de planification, où un même nom ne doit
         jamais apparaître deux fois. La migration 0039 interdit désormais deux affectations
         actives pour un même élève, mais la liste ne doit pas dépendre de cette garantie pour
         rester correcte. */
      etudiantsActifs: [...parEtudiant.entries()]
        .filter(([, e]) => e.actif)
        .map(([studentId]) => etudiantParId.get(studentId))
        .filter((e): e is Profile => !!e),
      etudiantsAnciens: [...parEtudiant.entries()]
        .filter(([, e]) => !e.actif && e.derniereFin)
        .map(([studentId, e]) => {
          const profil = etudiantParId.get(studentId)
          return profil ? { profil, transfereLe: e.derniereFin as string } : null
        })
        .filter((e): e is EtudiantAncien => e !== null),
      heuresEnseignees: resumeHeures?.heures_enseignees ?? 0,
    }
  })

  return {
    seances: valeur?.seances ?? [],
    etudiantsActifs: valeur?.etudiantsActifs ?? [],
    etudiantsAnciens: valeur?.etudiantsAnciens ?? [],
    heuresEnseignees: valeur?.heuresEnseignees ?? 0,
    loading,
    erreur,
    recharger,
  }
}
