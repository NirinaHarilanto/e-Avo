import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Cohort = Database['public']['Tables']['cohorts']['Row']

export interface VagueAvecMembres {
  cohorte: Cohort
  membreIds: string[]
}

/* Les vagues avec la liste de leurs inscrits, pour les convoquer d'un bloc à une réunion
   (demande client du 2026-09-23, point 11). L'admin voit toutes les vagues, un professeur
   uniquement celles qu'il accompagne — c'est la RLS qui tranche (0069), pas un filtre ici.

   `actif` à `false` suspend la requête, sans rien changer pour les appelants qui l'omettent : la
   messagerie est le même composant dans les trois espaces (2026-10-19) et n'a besoin des vagues
   que pour un admin ou un professeur. Pour un élève, la RLS ne renverrait de toute façon rien —
   autant ne pas poser la question. */
export function useVagues(actif = true) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(actif ? 'vagues-avec-membres' : null, async (): Promise<VagueAvecMembres[]> => {
    const { data: cohortes, error } = await supabase.from('cohorts').select('*').order('date_debut', { ascending: false })
    if (error) throw new Error(error.message)
    const ids = (cohortes ?? []).map((c) => c.id)
    if (ids.length === 0) return []

    const { data: inscriptions } = await supabase.from('cohort_enrollments').select('cohort_id, student_id').in('cohort_id', ids)
    const studentIds = [...new Set((inscriptions ?? []).map((i) => i.student_id))]
    // Un élève supprimé garde son inscription à la vague : l'exclure ici évite de convoquer un
    // compte qui n'existe plus.
    const { data: actifs } = studentIds.length
      ? await supabase.from('profiles').select('id').in('id', studentIds).neq('status', 'suspended')
      : { data: [] as { id: string }[] }
    const actifsIds = new Set((actifs ?? []).map((p) => p.id))

    return (cohortes ?? []).map((cohorte) => ({
      cohorte,
      membreIds: (inscriptions ?? [])
        .filter((i) => i.cohort_id === cohorte.id && actifsIds.has(i.student_id))
        .map((i) => i.student_id),
    }))
  })

  return { vagues: valeur ?? [], loading, erreur, recharger }
}
