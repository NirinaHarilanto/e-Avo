import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { resoudreGroupeEtudiant } from '../lib/groupeCollectifEtudiant'
import { useCacheRequete } from './useCacheRequete'

type Cohort = Database['public']['Tables']['cohorts']['Row']
type CohortClass = Database['public']['Tables']['cohort_classes']['Row']
type Session = Database['public']['Tables']['sessions']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface VagueEtudiant {
  cohorte: Cohort
  /* La classe de niveau de l'élève au sein de la promotion (0074) — `null` tant que la promotion
     n'a pas de classes, ou que l'élève n'y a pas encore été affecté. */
  classe: CohortClass | null
  professeur: Profile | null
  camarades: Profile[]
  seances: Session[]
}

/* La vague d'un élève en cours collectif, avec son planning complet et ses camarades — demande
   client du 2026-09-23 (point 8) : le planning prévisionnel « s'affichera dans l'espace
   personnel du professeur et tous les étudiants concernés par la même vague ».

   Scopé à la CLASSE de l'élève depuis le 2026-10-11 (demande client, attribution de professeur
   par classe) quand la promotion en a : professeur, camarades et séances sont alors ceux de SON
   groupe de niveau, pas de la promotion entière — voir lib/groupeCollectifEtudiant.ts pour le
   détail du professeur/des camarades. Sans classe, rien ne change : la promotion reste gérée
   comme un seul groupe (repli déjà posé par CohortesAdmin.tsx pour ce même cas). */
export function useVagueEtudiant(studentId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    studentId && `vague-etudiant-${studentId}`,
    async (): Promise<VagueEtudiant | null> => {
      const { data: inscription } = await supabase
        .from('cohort_enrollments')
        .select('cohort_id, cohort_class_id')
        .eq('student_id', studentId as string)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!inscription) return null

      const [{ data: cohorte }, { data: classe }] = await Promise.all([
        supabase.from('cohorts').select('*').eq('id', inscription.cohort_id).maybeSingle(),
        inscription.cohort_class_id
          ? supabase.from('cohort_classes').select('*').eq('id', inscription.cohort_class_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (!cohorte) return null

      const [{ data: seancesBrutes }, { data: membres }] = await Promise.all([
        /* Les séances de la classe de l'élève s'il en a une (`cohort_class_id` posé à leur
           création par PlanifierSeancesForfait), celles de la promotion entière sinon — sans
           quoi un élève du groupe Beginner verrait aussi le planning du groupe Advanced. */
        classe
          ? supabase.from('sessions').select('*').eq('cohort_class_id', classe.id).order('debut')
          : supabase.from('sessions').select('*').eq('cohort_id', cohorte.id).order('debut'),
        supabase.from('cohort_enrollments').select('student_id, cohort_class_id').eq('cohort_id', cohorte.id),
      ])

      const { professeurId, camaradeIds } = resoudreGroupeEtudiant(
        studentId as string,
        { student_id: studentId as string, cohort_class_id: inscription.cohort_class_id },
        membres ?? [],
        classe?.teacher_id ?? null,
        cohorte.teacher_id,
      )
      const profilIds = [...camaradeIds, ...(professeurId ? [professeurId] : [])]
      const { data: profils } = profilIds.length
        ? await supabase.from('profiles').select('*').in('id', profilIds).neq('status', 'suspended')
        : { data: [] as Profile[] }

      return {
        cohorte,
        classe: classe ?? null,
        professeur: (profils ?? []).find((p) => p.id === professeurId) ?? null,
        camarades: (profils ?? []).filter((p) => camaradeIds.includes(p.id)),
        seances: seancesBrutes ?? [],
      }
    },
  )

  return { vague: valeur ?? null, loading, erreur, recharger }
}
