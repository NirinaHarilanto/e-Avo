import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type TeacherPayment = Database['public']['Tables']['teacher_payments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface RemunerationProfesseur {
  paiement: TeacherPayment
  professeur: Profile | null
}

export function useRemunerationsProfesseurs() {
  const [remunerations, setRemunerations] = useState<RemunerationProfesseur[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    setErreur(null)

    const { data, error } = await supabase
      .from('teacher_payments')
      .select('*')
      .order('date_echeance', { ascending: true, nullsFirst: false })
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }

    const teacherIds = [...new Set((data ?? []).map((p) => p.teacher_id))]
    const { data: professeurs } = teacherIds.length
      ? await supabase.from('profiles').select('*').in('id', teacherIds)
      : { data: [] as Profile[] }
    const professeurParId = new Map((professeurs ?? []).map((p) => [p.id, p]))

    setRemunerations((data ?? []).map((paiement) => ({ paiement, professeur: professeurParId.get(paiement.teacher_id) ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { remunerations, loading, erreur, recharger: charger }
}
