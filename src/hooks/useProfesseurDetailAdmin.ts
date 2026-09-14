import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Profile = Database['public']['Tables']['profiles']['Row']
type TeacherAssignment = Database['public']['Tables']['teacher_assignments']['Row']
type Package = Database['public']['Tables']['packages']['Row']

export interface EleveDuProfesseur {
  eleve: Profile
  affectation: TeacherAssignment
  /* Heures enseignées PAR CE professeur À CET élève — dérivé de sessions ⋈
     session_enrollments (statut terminée, présence), PAS de hour_ledger : les écritures
     credit_professeur n'y portent aucun student_id (voir 0011_hour_ledger.sql), elles ne
     permettent donc de connaître que le total toutes classes confondues. */
  heuresEnseignees: number
  packages: Package[]
}

export interface ProfesseurDetail {
  professeur: Profile
  eleves: EleveDuProfesseur[]
  heuresTotalEnseignees: number
}

export function useProfesseurDetailAdmin(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(teacherId && `professeur-detail-${teacherId}`, async (): Promise<ProfesseurDetail> => {
    const { data: professeur, error: professeurError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', teacherId as string)
      .single()
    if (professeurError || !professeur) throw new Error(professeurError?.message ?? 'Professeur introuvable.')

    const { data: affectations } = await supabase
      .from('teacher_assignments')
      .select('*')
      .eq('teacher_id', teacherId as string)
      .is('date_fin', null)
      .order('date_debut', { ascending: false })

    const studentIds = [...new Set((affectations ?? []).map((a) => a.student_id))]

    const [{ data: eleveProfiles }, { data: packages }, { data: sessionsTerminees }] = await Promise.all([
      studentIds.length > 0 ? supabase.from('profiles').select('*').in('id', studentIds) : Promise.resolve({ data: [] as Profile[] }),
      studentIds.length > 0 ? supabase.from('packages').select('*').in('student_id', studentIds) : Promise.resolve({ data: [] as Package[] }),
      supabase.from('sessions').select('id, duree_minutes').eq('teacher_id', teacherId as string).eq('statut', 'terminee'),
    ])

    const eleveParId = new Map((eleveProfiles ?? []).map((e) => [e.id, e]))
    const packagesParEleve = new Map<string, Package[]>()
    for (const pkg of packages ?? []) {
      packagesParEleve.set(pkg.student_id, [...(packagesParEleve.get(pkg.student_id) ?? []), pkg])
    }

    const sessionIds = (sessionsTerminees ?? []).map((s) => s.id)
    const dureeParSession = new Map((sessionsTerminees ?? []).map((s) => [s.id, s.duree_minutes]))
    const heuresParEleve = new Map<string, number>()
    if (sessionIds.length > 0) {
      const { data: enrollments } = await supabase
        .from('session_enrollments')
        .select('session_id, student_id, present')
        .in('session_id', sessionIds)
        .eq('present', true)
      for (const enrollment of enrollments ?? []) {
        const duree = dureeParSession.get(enrollment.session_id) ?? 0
        heuresParEleve.set(enrollment.student_id, (heuresParEleve.get(enrollment.student_id) ?? 0) + duree / 60)
      }
    }

    /* Une ligne par élève, pas par affectation : la fiche professeur liste des personnes, un
       même nom ne doit jamais y figurer deux fois (voir aussi useCalendrierProfesseur.ts).
       `affectations` est trié du plus récent au plus ancien, on garde donc la première vue. */
    const affectationParEleve = new Map<string, TeacherAssignment>()
    for (const affectation of affectations ?? []) {
      if (!affectationParEleve.has(affectation.student_id)) {
        affectationParEleve.set(affectation.student_id, affectation)
      }
    }
    const eleves: EleveDuProfesseur[] = [...affectationParEleve.values()]
      .map((affectation) => {
        const eleve = eleveParId.get(affectation.student_id)
        return eleve
          ? {
              eleve,
              affectation,
              heuresEnseignees: heuresParEleve.get(affectation.student_id) ?? 0,
              packages: packagesParEleve.get(affectation.student_id) ?? [],
            }
          : null
      })
      .filter((v): v is EleveDuProfesseur => v !== null)

    return {
      professeur,
      eleves,
      heuresTotalEnseignees: [...heuresParEleve.values()].reduce((total, h) => total + h, 0),
    }
  })

  return { detail: valeur ?? null, loading, erreur, recharger }
}
