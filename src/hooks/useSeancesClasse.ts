import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'
import type { SeanceProfesseur } from './useCalendrierProfesseur'

type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']

/* Le planning déjà posé d'une classe de niveau (ou, à défaut, d'une vague entière pas encore
   scindée en classes) — demande client du 2026-10-12 : « le professeur doit pouvoir retrouver le
   planning établi pour chaque classe qu'il gère », et de même côté admin (CohortesAdmin.tsx).
   Avant ce hook, `cohort_class_id`/`cohort_id` étaient posés à la création (creerSeance.ts) mais
   jamais relus nulle part : le bouton « Planning de la classe » n'ouvrait qu'un formulaire de
   création, sans jamais montrer ce qui existait déjà. La RLS tranche qui voit quoi
   (sessions_teacher_all/sessions_admin_all, 0008) — pas de filtre supplémentaire ici.

   Même forme que `useCalendrierProfesseur` (`SeanceProfesseur` : séance + inscrits + visio) parce
   que les lignes du planning ouvrent la MÊME carte que l'agenda (CarteSeance.tsx), qui a besoin
   des inscrits pour l'émargement de la clôture. */
export function useSeancesClasse(params: { cohortClassId?: string; cohortId?: string }) {
  const cle = params.cohortClassId ? `seances-classe:${params.cohortClassId}` : params.cohortId ? `seances-vague:${params.cohortId}` : null

  const { valeur, loading, erreur, recharger } = useCacheRequete(cle, async (): Promise<SeanceProfesseur[]> => {
    const requete = supabase.from('sessions').select('*').order('debut', { ascending: true })
    const { data: sessions, error } = params.cohortClassId
      ? await requete.eq('cohort_class_id', params.cohortClassId)
      : await requete.eq('cohort_id', params.cohortId as string)
    if (error) throw new Error(error.message)

    const sessionIds = (sessions ?? []).map((s) => s.id)
    if (sessionIds.length === 0) return []

    const [{ data: inscriptions }, { data: videos }] = await Promise.all([
      supabase.from('session_enrollments').select('*').in('session_id', sessionIds),
      supabase.from('video_sessions').select('*').in('session_id', sessionIds),
    ])

    // Un élève supprimé (soft-delete) garde son inscription : l'exclure ici évite de le proposer
    // à l'émargement d'une clôture, même garde que useCalendrierProfesseur.
    const studentIds = [...new Set((inscriptions ?? []).map((i) => i.student_id))]
    const { data: etudiants } = studentIds.length
      ? await supabase.from('profiles').select('*').in('id', studentIds).neq('status', 'suspended')
      : { data: [] as Profile[] }

    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))
    const videoParSession = new Map((videos ?? []).map((v: VideoSession) => [v.session_id, v]))

    return (sessions ?? []).map((session) => ({
      session,
      inscriptions: (inscriptions ?? [])
        .filter((i: SessionEnrollment) => i.session_id === session.id)
        .map((i: SessionEnrollment) => ({ ...i, etudiant: etudiantParId.get(i.student_id) ?? null })),
      video: videoParSession.get(session.id) ?? null,
    }))
  })

  return { seances: valeur ?? [], loading, erreur, recharger }
}
