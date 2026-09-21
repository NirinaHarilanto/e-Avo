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
  /* Affectation en cours, reconnue à `date_fin is null` — jamais « la première période de la
     liste ». Deux affectations peuvent partager la même `date_debut` (c'est une date, pas un
     instant : un changement de professeur le jour même en crée deux), et à égalité PostgreSQL
     ne garantit aucun ordre. La migration 0039 garantit qu'il y en a au plus une active. */
  periodeActuelle: PeriodeProfesseur | null
  diagnostic: DiagnosticCall | null
  packages: Package[]
  /* Vague (cohorte) collectif de l'étudiant, s'il en a une — sinon il est individuel/duo via
     `packages`. Pas de colonne dédiée : la présence d'une inscription à une cohorte suffit à
     distinguer les deux cas. */
  cohorte: Cohort | null
  heuresConsommees: number
  prochaineSeance: SeanceDuParcours | null
  /* DUO (0054) : la personne dont le profil pointe VERS ce dossier (duo_partenaire_id = ce
     studentId), s'il y en a une — ce studentId est alors le « principal » du binôme. `null` si
     cet étudiant n'est pas en duo, ou s'il en est lui-même la « secondaire » (dans ce cas c'est
     son PROPRE profil qui porte duo_partenaire_id, pas ce champ-ci). */
  duoPartenaire: Profile | null
}

export function useDossierEtudiant(studentId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(studentId && `dossier-etudiant-${studentId}`, async (): Promise<DossierEtudiant> => {
    // Vague 1 : ces 6 requêtes ne dépendent QUE de `studentId`, déjà connu avant même d'appeler
    // cette fonction — aucune n'a besoin du contenu d'une autre pour partir. `etudiant` était
    // auparavant fetché seul, en séquentiel, avant tout le reste, sans raison : ça ajoutait un
    // aller-retour réseau complet à chaque ouverture d'un dossier.
    const [
      { data: etudiant, error: etudiantError },
      { data: affectations },
      { data: enrollments },
      { data: packages },
      { data: resume },
      { data: inscriptionCohorte },
      { data: duoPartenaire },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', studentId as string).single(),
      // Tri secondaire sur created_at : `date_debut` est une date, deux affectations du même
      // jour y sont à égalité et l'ordre serait alors arbitraire.
      supabase
        .from('teacher_assignments')
        .select('*')
        .eq('student_id', studentId as string)
        .order('date_debut', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('session_enrollments').select('*').eq('student_id', studentId as string),
      supabase.from('packages').select('*').eq('student_id', studentId as string).order('created_at', { ascending: false }),
      supabase.from('student_hours_summary').select('*').eq('student_id', studentId as string).maybeSingle(),
      supabase.from('cohort_enrollments').select('cohort_id').eq('student_id', studentId as string).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('profiles').select('*').eq('duo_partenaire_id', studentId as string).maybeSingle(),
    ])
    if (etudiantError || !etudiant) throw new Error(etudiantError?.message ?? 'Étudiant introuvable.')

    const sessionIds = [...new Set((enrollments ?? []).map((e) => e.session_id))]
    const teacherIds = [...new Set((affectations ?? []).map((a) => a.teacher_id))]

    // Vague 2 : chacune de ces 5 requêtes dépend d'un résultat de la vague 1 (inscriptionCohorte,
    // sessionIds, teacherIds ou etudiant.prospect_id), mais JAMAIS du résultat d'une autre requête
    // de cette même vague — elles peuvent donc toutes partir ensemble plutôt qu'en cascade.
    const [{ data: cohorte }, { data: sessions }, { data: videos }, { data: professeurs }, { data: diagnostic }] = await Promise.all([
      inscriptionCohorte
        ? supabase.from('cohorts').select('*').eq('id', inscriptionCohorte.cohort_id).maybeSingle()
        : Promise.resolve({ data: null as Cohort | null }),
      sessionIds.length > 0 ? supabase.from('sessions').select('*').in('id', sessionIds) : Promise.resolve({ data: [] as Session[] }),
      sessionIds.length > 0 ? supabase.from('video_sessions').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as VideoSession[] }),
      teacherIds.length > 0 ? supabase.from('profiles').select('*').in('id', teacherIds) : Promise.resolve({ data: [] as Profile[] }),
      etudiant.prospect_id
        ? supabase.from('diagnostic_calls').select('*').eq('prospect_id', etudiant.prospect_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null as DiagnosticCall | null }),
    ])
    const sessionParId = new Map((sessions ?? []).map((s) => [s.id, s]))
    const videoParSession = new Map((videos ?? []).map((v) => [v.session_id, v]))
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

    const maintenant = new Date().toISOString()
    const prochaineSeance =
      seancesToutes
        .filter((s) => s.session.statut === 'planifiee' && s.session.debut >= maintenant)
        .sort((a, b) => a.session.debut.localeCompare(b.session.debut))[0] ?? null

    return {
      etudiant,
      periodes,
      periodeActuelle: periodes.find((p) => !p.affectation.date_fin) ?? null,
      diagnostic,
      packages: packages ?? [],
      cohorte: cohorte ?? null,
      heuresConsommees: resume?.heures_consommees ?? 0,
      prochaineSeance,
      duoPartenaire: duoPartenaire ?? null,
    }
  })

  return { dossier: valeur ?? null, loading, erreur, recharger }
}
