import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import type { EntreeCompteRendu } from '../lib/syntheseComptesRendus'
import { useCacheRequete } from './useCacheRequete'

type Session = Database['public']['Tables']['sessions']['Row']
type SessionReport = Database['public']['Tables']['session_reports']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

/* Comptes rendus des séances D'UN élève, pour la synthèse du dossier (demande client du
   2026-09-30). Volontairement distinct de useSessionReports, qui ramène tous les comptes rendus
   visibles de l'établissement pour l'onglet Documents : ici on part de l'élève, et la requête est
   suspendue tant que la fenêtre de synthèse n'est pas ouverte (`actif`) — le bouton vit dans
   l'en-tête de CHAQUE dossier consulté, il n'a pas à déclencher quatre requêtes à chaque clic sur
   un nom dans la liste.

   Aucun filtre de visibilité à écrire : la RLS s'en charge et donne exactement la bonne portée
   selon qui regarde — l'admin voit tous les comptes rendus de l'établissement
   (`session_reports_admin_select`, 0033), un professeur uniquement ceux dont il est l'auteur
   (`session_reports_teacher_all`), et `session_enrollments_teacher_select` (0009) limite déjà de
   la même façon les séances qu'il peut lister. */
export function useComptesRendusEtudiant(studentId: string | undefined, actif: boolean) {
  const { valeur, loading, erreur } = useCacheRequete(
    actif && studentId ? `comptes-rendus-etudiant-${studentId}` : null,
    async () => {
      const { data: inscriptions, error } = await supabase
        .from('session_enrollments')
        .select('session_id, present')
        .eq('student_id', studentId as string)
      if (error) throw new Error(error.message)

      const sessionIds = [...new Set((inscriptions ?? []).map((i) => i.session_id))]
      if (sessionIds.length === 0) return { entrees: [] as EntreeCompteRendu[], nbSeancesTerminees: 0 }

      const [{ data: sessions }, { data: rapports }] = await Promise.all([
        supabase.from('sessions').select('*').in('id', sessionIds),
        supabase.from('session_reports').select('*').in('session_id', sessionIds),
      ])

      const teacherIds = [...new Set((rapports ?? []).map((r) => r.teacher_id))]
      const { data: profils } = teacherIds.length
        ? await supabase.from('profiles').select('*').in('id', teacherIds)
        : { data: [] as Profile[] }

      const sessionParId = new Map((sessions ?? []).map((s) => [s.id, s]))
      const presenceParSession = new Map((inscriptions ?? []).map((i) => [i.session_id, i.present]))
      const professeurParId = new Map((profils ?? []).map((p) => [p.id, `${p.prenom ?? ''} ${p.nom ?? ''}`.trim()]))

      const entrees = (rapports ?? [])
        .map((rapport: SessionReport): EntreeCompteRendu | null => {
          const session: Session | undefined = sessionParId.get(rapport.session_id)
          // Séance invisible pour l'appelant (cas théorique : la RLS de `sessions` est plus large
          // que celle de `session_reports`, jamais l'inverse) — sans date ni durée, l'entrée ne
          // peut ni être située dans le temps ni comptée en heures, on l'écarte.
          if (!session) return null
          return {
            rapport,
            debut: session.debut,
            dureeMinutes: session.duree_minutes,
            type: session.type,
            professeur: professeurParId.get(rapport.teacher_id) ?? null,
            present: presenceParSession.get(rapport.session_id) ?? null,
          }
        })
        .filter((e): e is EntreeCompteRendu => e !== null)

      return {
        entrees,
        // « Reportée » (0085) exclue à dessein : la séance n'a pas eu lieu, elle n'attend aucun
        // compte rendu — la compter ici afficherait un manque qui n'existe pas.
        nbSeancesTerminees: (sessions ?? []).filter((s) => s.statut === 'terminee').length,
      }
    },
  )

  return { entrees: valeur?.entrees ?? [], nbSeancesTerminees: valeur?.nbSeancesTerminees ?? 0, loading, erreur }
}
