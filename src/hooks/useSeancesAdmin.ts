import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'
import { inscriptionsVisibles } from '../lib/seances'

type Session = Database['public']['Tables']['sessions']['Row']
type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']

export interface SeanceAdmin {
  session: Session
  professeur: Profile | null
  inscriptions: (SessionEnrollment & { etudiant: Profile | null })[]
  video: VideoSession | null
}

/* Vue globale de toutes les séances de l'établissement pour l'admin — même agrégation
   côté client que useCalendrierProfesseur.ts (pas de jointure SQL, pattern déjà établi dans
   ce projet), mais sans filtre teacher_id : la policy RLS `sessions_admin_all` s'en charge. */
export function useSeancesAdmin() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('seances-admin', async () => {
    /* Les quatre requêtes partent ENSEMBLE (optimisation du 2026-10-13). Elles s'enchaînaient
       auparavant en quatre allers-retours successifs — séances, puis inscriptions/visios filtrées
       sur leurs identifiants, puis profils des élèves tirés de ces inscriptions — et le dernier ne
       démarrait qu'à 4,5 s sur cet écran. Chaque aller-retour coûte ici 0,5 à 2,8 s (base en
       Europe, utilisateurs à Madagascar), donc c'est leur NOMBRE qui fait le temps d'attente, pas
       le volume transféré.
       Les inscriptions et visios ne sont plus filtrées par identifiant de séance : comme toutes
       les séances de l'établissement sont de toute façon chargées, le volume est le même, et la
       RLS limite déjà ces tables à l'établissement. Les profils sont chargés d'un bloc plutôt
       qu'en deux requêtes (professeurs puis élèves) — ils sont peu nombreux. */
    const [{ data: sessions, error: sessionsError }, { data: enrollments }, { data: videos }, { data: profils }] = await Promise.all([
      supabase.from('sessions').select('*').order('debut', { ascending: false }),
      supabase.from('session_enrollments').select('*'),
      supabase.from('video_sessions').select('*'),
      // Un professeur supprimé disparaît de son propre nom sur la séance — la séance elle-même
      // reste visible, c'est l'historique de l'élève qui la concerne (demande client du
      // 2026-09-23).
      supabase.from('profiles').select('*').neq('status', 'suspended'),
    ])
    if (sessionsError) throw new Error(sessionsError.message)

    const profParId = new Map((profils ?? []).map((p) => [p.id, p]))
    const videoParSession = new Map((videos ?? []).map((v) => [v.session_id, v]))
    const etudiantParId = profParId

    return (sessions ?? []).flatMap((session): SeanceAdmin[] => {
      const inscriptions = (enrollments ?? [])
        .filter((e) => e.session_id === session.id)
        .map((e) => ({ ...e, etudiant: etudiantParId.get(e.student_id) ?? null }))
      const visibles = inscriptionsVisibles(inscriptions)
      if (!visibles) return []
      return [{
        session,
        professeur: profParId.get(session.teacher_id) ?? null,
        inscriptions: visibles,
        video: videoParSession.get(session.id) ?? null,
      }]
    })
  })

  return { seances: valeur ?? [], loading, erreur, recharger }
}
