import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type TeacherPayment = Database['public']['Tables']['teacher_payments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface RemunerationProfesseur {
  paiement: TeacherPayment
  professeur: Profile | null
}

export function useRemunerationsProfesseurs() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('remunerations-professeurs', async () => {
    const { data, error } = await supabase
      .from('teacher_payments')
      .select('*')
      .is('supprime_le', null)
      .order('date_echeance', { ascending: true, nullsFirst: false })
    if (error) throw new Error(error.message)

    const teacherIds = [...new Set((data ?? []).map((p) => p.teacher_id))]
    // Une rémunération d'un professeur supprimé disparaît de la liste (demande client du
    // 2026-09-23) — la ligne reste en base, réversible s'il se réinscrit.
    const { data: professeurs } = teacherIds.length
      ? await supabase.from('profiles').select('*').in('id', teacherIds).neq('status', 'suspended')
      : { data: [] as Profile[] }
    const professeurParId = new Map((professeurs ?? []).map((p) => [p.id, p]))

    return (data ?? [])
      .filter((paiement) => professeurParId.has(paiement.teacher_id))
      .map((paiement): RemunerationProfesseur => ({ paiement, professeur: professeurParId.get(paiement.teacher_id) ?? null }))
  })

  return { remunerations: valeur ?? [], loading, erreur, recharger }
}
