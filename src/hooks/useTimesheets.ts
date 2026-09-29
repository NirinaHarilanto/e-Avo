import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Timesheet = Database['public']['Tables']['timesheets']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface TimesheetAvecProfesseur {
  timesheet: Timesheet
  professeur: Pick<Profile, 'id' | 'prenom' | 'nom' | 'taux_horaire'> | null
}

/* TimeSheets visibles par l'utilisateur (0081) : tous ceux de l'établissement pour l'admin, les
   siens pour un professeur — c'est la RLS qui tranche. Plus récents d'abord, soumis en tête. */
export function useTimesheets(cleSuffixe: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(cleSuffixe && `timesheets-${cleSuffixe}`, async () => {
    const { data, error } = await supabase.from('timesheets').select('*').order('soumis_le', { ascending: false })
    if (error) throw new Error(error.message)
    const ids = [...new Set((data ?? []).map((t) => t.teacher_id))]
    const { data: profs } = ids.length
      ? await supabase.from('profiles').select('id, prenom, nom, taux_horaire').in('id', ids)
      : { data: [] as TimesheetAvecProfesseur['professeur'][] }
    const parId = new Map((profs ?? []).map((p) => [p!.id, p]))
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
}

/* Heures clôturées d'un professeur, ni payées ni déjà déclarées sur un TimeSheet en cours. */
export function useHeuresDeclarables(teacherId: string | undefined) {
  const { valeur, loading, recharger } = useCacheRequete(teacherId && `heures-declarables-${teacherId}`, async () => {
    const { data: ecritures } = await supabase
      .from('hour_ledger')
      .select('id, heures, session_id')
      .eq('teacher_id', teacherId as string)
      .eq('type_ecriture', 'credit_professeur')
      .is('teacher_payment_id', null)
      .is('timesheet_id', null)
    const sessionIds = [...new Set((ecritures ?? []).map((e) => e.session_id))]
    if (sessionIds.length === 0) return [] as HeureDeclarable[]
    const [{ data: seances }, { data: inscriptions }] = await Promise.all([
      supabase.from('sessions').select('id, debut').in('id', sessionIds),
      supabase.from('session_enrollments').select('session_id, student_id').in('session_id', sessionIds),
    ])
    const eleveIds = [...new Set((inscriptions ?? []).map((i) => i.student_id))]
    const { data: eleves } = eleveIds.length
      ? await supabase.from('profiles').select('id, prenom, nom').in('id', eleveIds)
      : { data: [] as Pick<Profile, 'id' | 'prenom' | 'nom'>[] }
    const nom = new Map((eleves ?? []).map((e) => [e.id, [e.prenom, e.nom].filter(Boolean).join(' ')]))
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
      }))
      .sort((a, b) => (a.debut ?? '').localeCompare(b.debut ?? ''))
  })
  return { heures: valeur ?? [], loading, recharger }
}
