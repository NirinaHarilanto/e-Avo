import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { chargerProfilsEtablissement } from '../lib/profilsEtablissement'
import { useCacheRequete } from './useCacheRequete'

type TeacherPayment = Database['public']['Tables']['teacher_payments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface RemunerationProfesseur {
  paiement: TeacherPayment
  professeur: Profile | null
}

export function useRemunerationsProfesseurs() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('remunerations-professeurs', async () => {
    /* Les profils partent EN MÊME TEMPS que les rémunérations (optimisation du 2026-10-13) : les
       nommer demandait d'attendre les rémunérations, soit deux allers-retours successifs au lieu
       d'un — voir lib/profilsEtablissement.ts. */
    const [{ data, error }, profilsTous] = await Promise.all([
      supabase
        .from('teacher_payments')
        .select('*')
        .is('supprime_le', null)
        .order('date_echeance', { ascending: true, nullsFirst: false }),
      chargerProfilsEtablissement(),
    ])
    if (error) throw new Error(error.message)

    // Une rémunération d'un professeur supprimé disparaît de la liste (demande client du
    // 2026-09-23) — la ligne reste en base, réversible s'il se réinscrit.
    const professeurParId = new Map(profilsTous.filter((p) => p.status !== 'suspended').map((p) => [p.id, p]))

    return (data ?? [])
      .filter((paiement) => professeurParId.has(paiement.teacher_id))
      .map((paiement): RemunerationProfesseur => ({ paiement, professeur: professeurParId.get(paiement.teacher_id) ?? null }))
  })

  return { remunerations: valeur ?? [], loading, erreur, recharger }
}
