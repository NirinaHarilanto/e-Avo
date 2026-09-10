import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Quote = Database['public']['Tables']['quotes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface DevisAvecEtudiant {
  devis: Quote
  etudiant: Profile | null
}

export function useDevis() {
  const [devis, setDevis] = useState<DevisAvecEtudiant[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    setErreur(null)

    const { data, error } = await supabase.from('quotes').select('*').order('date_emission', { ascending: false })
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }

    const studentIds = [...new Set((data ?? []).map((d) => d.student_id))]
    const { data: etudiants } = studentIds.length
      ? await supabase.from('profiles').select('*').in('id', studentIds)
      : { data: [] as Profile[] }
    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))

    setDevis((data ?? []).map((d) => ({ devis: d, etudiant: etudiantParId.get(d.student_id) ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { devis, loading, erreur, recharger: charger }
}
