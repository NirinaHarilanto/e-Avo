import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { chargerProfilsEtablissement } from '../lib/profilsEtablissement'
import { useCacheRequete } from './useCacheRequete'

type Timesheet = Database['public']['Tables']['timesheets']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface TimesheetAvecProfesseur {
  timesheet: Timesheet
  professeur: Pick<Profile, 'id' | 'prenom' | 'nom' | 'taux_horaire_individuel' | 'taux_horaire_duo' | 'taux_horaire_collectif'> | null
}

/* TimeSheets visibles par l'utilisateur (0081) : tous ceux de l'établissement pour l'admin, les
   siens pour un professeur — c'est la RLS qui tranche. Plus récents d'abord, soumis en tête. */
export function useTimesheets(cleSuffixe: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(cleSuffixe && `timesheets-${cleSuffixe}`, async () => {
    /* Les profils partent EN MÊME TEMPS que les TimeSheets (optimisation du 2026-10-13) : les
       nommer demandait d'attendre les TimeSheets, soit deux allers-retours successifs au lieu d'un
       — voir lib/profilsEtablissement.ts. Pas de filtre sur `status` ici, volontairement : le nom
       d'un professeur supprimé doit rester lisible sur ses anciens TimeSheets. */
    const [{ data, error }, profilsTous] = await Promise.all([
      supabase.from('timesheets').select('*').order('soumis_le', { ascending: false }),
      chargerProfilsEtablissement(),
    ])
    if (error) throw new Error(error.message)
    const parId = new Map(profilsTous.map((p) => [p.id, p]))
    const ordre = { soumis: 0, refuse: 1, valide: 2 } as const
    return (data ?? [])
      .map((timesheet) => ({ timesheet, professeur: parId.get(timesheet.teacher_id) ?? null }))
      .sort((a, b) => ordre[a.timesheet.statut] - ordre[b.timesheet.statut])
  })
  return { timesheets: valeur ?? [], loading, erreur, recharger }
}

export interface HeureDeclarable {
  id: string
  heures: number
  sessionId: string
  debut: string | null
  eleves: string
  /* Type figé à la clôture (0126) — null pour une écriture antérieure, traitée comme
     'individuel' par src/lib/remuneration.ts. */
  typeFacturation: string | null
}

/* Heures clôturées d'un professeur, ni payées ni déjà déclarées sur un TimeSheet en cours. */
export function useHeuresDeclarables(teacherId: string | undefined) {
  const { valeur, loading, recharger } = useCacheRequete(teacherId && `heures-declarables-${teacherId}`, async () => {
    /* TOUT part ensemble (optimisation du 2026-10-13). C'étaient trois vagues successives — les
       écritures d'heures, puis les séances et inscriptions portant leurs identifiants, puis les
       profils des élèves ainsi trouvés : trois attentes alors que les séances et inscriptions du
       professeur sont déjà bornées par leurs policies (0009). Le filtrage par identifiant de
       séance se fait désormais en mémoire, pour un résultat identique. */
    const [{ data: ecritures }, { data: toutesSeances }, { data: toutesInscriptions }, profilsTous] = await Promise.all([
      supabase
        .from('hour_ledger')
        .select('id, heures, session_id, type_facturation')
        .eq('teacher_id', teacherId as string)
        .eq('type_ecriture', 'credit_professeur')
        .is('teacher_payment_id', null)
        .is('timesheet_id', null),
      supabase.from('sessions').select('id, debut'),
      supabase.from('session_enrollments').select('session_id, student_id'),
      chargerProfilsEtablissement(),
    ])
    const sessionIds = new Set((ecritures ?? []).map((e) => e.session_id))
    if (sessionIds.size === 0) return [] as HeureDeclarable[]
    const seances = (toutesSeances ?? []).filter((s) => sessionIds.has(s.id))
    const inscriptions = (toutesInscriptions ?? []).filter((i) => sessionIds.has(i.session_id))
    const nom = new Map(profilsTous.map((e) => [e.id, [e.prenom, e.nom].filter(Boolean).join(' ')]))
    const debut = new Map((seances ?? []).map((s) => [s.id, s.debut]))
    return (ecritures ?? [])
      .map((e) => ({
        id: e.id,
        heures: Number(e.heures),
        sessionId: e.session_id,
        debut: debut.get(e.session_id) ?? null,
        eleves: (inscriptions ?? [])
          .filter((i) => i.session_id === e.session_id)
          .map((i) => nom.get(i.student_id) ?? 'Élève')
          .join(', '),
        typeFacturation: e.type_facturation,
      }))
      .sort((a, b) => (a.debut ?? '').localeCompare(b.debut ?? ''))
  })
  return { heures: valeur ?? [], loading, recharger }
}
