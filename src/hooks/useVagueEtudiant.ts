import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Cohort = Database['public']['Tables']['cohorts']['Row']
type Session = Database['public']['Tables']['sessions']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface VagueEtudiant {
  cohorte: Cohort
  professeur: Profile | null
  camarades: Profile[]
  seances: Session[]
}

/* La vague d'un élève en cours collectif, avec son planning complet et ses camarades — demande
   client du 2026-09-23 (point 8) : le planning prévisionnel « s'affichera dans l'espace
   personnel du professeur et tous les étudiants concernés par la même vague ». Les séances
   viennent de `sessions.cohort_id` et non des inscriptions : un élève arrivé en cours de route
   voit ainsi tout le programme du groupe, pas seulement les séances où il est déjà inscrit
   (policy sessions_student_select_vague, 0069). */
export function useVagueEtudiant(studentId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    studentId && `vague-etudiant-${studentId}`,
    async (): Promise<VagueEtudiant | null> => {
      const { data: inscription } = await supabase
        .from('cohort_enrollments')
        .select('cohort_id')
        .eq('student_id', studentId as string)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!inscription) return null

      const { data: cohorte } = await supabase.from('cohorts').select('*').eq('id', inscription.cohort_id).maybeSingle()
      if (!cohorte) return null

      const [{ data: seances }, { data: membres }] = await Promise.all([
        supabase.from('sessions').select('*').eq('cohort_id', cohorte.id).order('debut'),
        supabase.from('cohort_enrollments').select('student_id').eq('cohort_id', cohorte.id),
      ])

      const autresIds = (membres ?? []).map((m) => m.student_id).filter((id) => id !== studentId)
      const profilIds = [...autresIds, ...(cohorte.teacher_id ? [cohorte.teacher_id] : [])]
      const { data: profils } = profilIds.length
        ? await supabase.from('profiles').select('*').in('id', profilIds).neq('status', 'suspended')
        : { data: [] as Profile[] }

      return {
        cohorte,
        professeur: (profils ?? []).find((p) => p.id === cohorte.teacher_id) ?? null,
        camarades: (profils ?? []).filter((p) => autresIds.includes(p.id)),
        seances: seances ?? [],
      }
    },
  )

  return { vague: valeur ?? null, loading, erreur, recharger }
}
