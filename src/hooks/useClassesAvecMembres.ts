import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type CohortClass = Database['public']['Tables']['cohort_classes']['Row']
type Cohort = Database['public']['Tables']['cohorts']['Row']

export interface ClasseAvecMembres {
  classe: CohortClass
  cohorte: Cohort | null
  membreIds: string[]
}

/* Les classes de niveau (0074) avec la liste de leurs inscrits, pour les convoquer d'un bloc à
   un rendez-vous — pendant de useVagues() pour les promotions entières. L'admin voit toutes les
   classes, un professeur uniquement celles qu'il encadre : c'est la RLS qui tranche
   (cohort_classes_admin_all / cohort_classes_teacher_select, 0074), pas un filtre ici. */
export function useClassesAvecMembres() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('classes-avec-membres', async (): Promise<ClasseAvecMembres[]> => {
    const { data: classes, error } = await supabase.from('cohort_classes').select('*')
    if (error) throw new Error(error.message)
    const classeIds = (classes ?? []).map((c) => c.id)
    if (classeIds.length === 0) return []

    const cohortIds = [...new Set((classes ?? []).map((c) => c.cohort_id))]
    const [{ data: inscriptions }, { data: cohortes }] = await Promise.all([
      supabase.from('cohort_enrollments').select('cohort_class_id, student_id').in('cohort_class_id', classeIds),
      cohortIds.length > 0 ? supabase.from('cohorts').select('*').in('id', cohortIds) : Promise.resolve({ data: [] as Cohort[] }),
    ])
    const studentIds = [...new Set((inscriptions ?? []).map((i) => i.student_id))]
    // Un élève supprimé garde son inscription à la classe : l'exclure ici évite de convoquer un
    // compte qui n'existe plus (même garde que useVagues()).
    const { data: actifs } = studentIds.length
      ? await supabase.from('profiles').select('id').in('id', studentIds).neq('status', 'suspended')
      : { data: [] as { id: string }[] }
    const actifsIds = new Set((actifs ?? []).map((p) => p.id))
    const cohorteParId = new Map((cohortes ?? []).map((c) => [c.id, c]))

    return (classes ?? []).map((classe) => ({
      classe,
      cohorte: cohorteParId.get(classe.cohort_id) ?? null,
      membreIds: (inscriptions ?? [])
        .filter((i) => i.cohort_class_id === classe.id && actifsIds.has(i.student_id))
        .map((i) => i.student_id),
    }))
  })

  return { classes: valeur ?? [], loading, erreur, recharger }
}
