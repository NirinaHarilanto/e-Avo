import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Invoice = Database['public']['Tables']['invoices']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface FactureAvecEtudiant {
  facture: Invoice
  etudiant: Profile | null
}

export function useFactures() {
  const [factures, setFactures] = useState<FactureAvecEtudiant[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    setErreur(null)

    const { data, error } = await supabase.from('invoices').select('*').order('date_emission', { ascending: false })
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }

    const studentIds = [...new Set((data ?? []).map((f) => f.student_id))]
    const { data: etudiants } = studentIds.length
      ? await supabase.from('profiles').select('*').in('id', studentIds)
      : { data: [] as Profile[] }
    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))

    setFactures((data ?? []).map((f) => ({ facture: f, etudiant: etudiantParId.get(f.student_id) ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { factures, loading, erreur, recharger: charger }
}
