import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Session = Database['public']['Tables']['sessions']['Row']

/* Le planning déjà posé d'une classe de niveau (ou, à défaut, d'une vague entière pas encore
   scindée en classes) — demande client du 2026-10-12 : « le professeur doit pouvoir retrouver le
   planning établi pour chaque classe qu'il gère », et de même côté admin (CohortesAdmin.tsx).
   Avant ce hook, `cohort_class_id`/`cohort_id` étaient posés à la création (creerSeance.ts) mais
   jamais relus nulle part : le bouton « Planning de la classe » n'ouvrait qu'un formulaire de
   création, sans jamais montrer ce qui existait déjà. La RLS tranche qui voit quoi
   (sessions_teacher_all/sessions_admin_all, 0008) — pas de filtre supplémentaire ici. */
export function useSeancesClasse(params: { cohortClassId?: string; cohortId?: string }) {
  const cle = params.cohortClassId ? `seances-classe:${params.cohortClassId}` : params.cohortId ? `seances-vague:${params.cohortId}` : null

  const { valeur, loading, erreur, recharger } = useCacheRequete(cle, async (): Promise<Session[]> => {
    const requete = supabase.from('sessions').select('*').order('debut', { ascending: true })
    const { data, error } = params.cohortClassId
      ? await requete.eq('cohort_class_id', params.cohortClassId)
      : await requete.eq('cohort_id', params.cohortId as string)
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { seances: valeur ?? [], loading, erreur, recharger }
}
