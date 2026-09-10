import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type StudentPayment = Database['public']['Tables']['student_payments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface PaiementEtudiant {
  paiement: StudentPayment
  etudiant: Profile | null
}

export function usePaiementsEtudiants() {
  const [paiements, setPaiements] = useState<PaiementEtudiant[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    setErreur(null)

    const { data, error } = await supabase
      .from('student_payments')
      .select('*')
      .order('date_echeance', { ascending: true, nullsFirst: false })
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }

    const studentIds = [...new Set((data ?? []).map((p) => p.student_id))]
    const { data: etudiants } = studentIds.length
      ? await supabase.from('profiles').select('*').in('id', studentIds)
      : { data: [] as Profile[] }
    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))

    setPaiements((data ?? []).map((paiement) => ({ paiement, etudiant: etudiantParId.get(paiement.student_id) ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { paiements, loading, erreur, recharger: charger }
}
