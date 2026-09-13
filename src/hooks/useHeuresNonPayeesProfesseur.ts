import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export interface LigneHeureNonPayee {
  id: string
  heures: number
  sessionDebut: string | null
}

/* Écritures hour_ledger de type credit_professeur non encore rattachées à un paiement
   (teacher_payment_id is null) — le détail des heures enseignées non payées demandé pour le
   règlement au forfait horaire. */
export function useHeuresNonPayeesProfesseur(teacherId: string | undefined) {
  const [lignes, setLignes] = useState<LigneHeureNonPayee[]>([])
  const [loading, setLoading] = useState(false)

  const charger = useCallback(async () => {
    if (!teacherId) {
      setLignes([])
      return
    }
    setLoading(true)
    const { data: ecritures } = await supabase
      .from('hour_ledger')
      .select('id, heures, session_id')
      .eq('teacher_id', teacherId)
      .eq('type_ecriture', 'credit_professeur')
      .is('teacher_payment_id', null)

    const sessionIds = [...new Set((ecritures ?? []).map((e) => e.session_id))]
    const { data: sessions } = sessionIds.length
      ? await supabase.from('sessions').select('id, debut').in('id', sessionIds)
      : { data: [] as { id: string; debut: string }[] }
    const debutParSession = new Map((sessions ?? []).map((s) => [s.id, s.debut]))

    setLignes(
      (ecritures ?? [])
        .map((e) => ({ id: e.id, heures: e.heures, sessionDebut: debutParSession.get(e.session_id) ?? null }))
        .sort((a, b) => (a.sessionDebut ?? '').localeCompare(b.sessionDebut ?? '')),
    )
    setLoading(false)
  }, [teacherId])

  useEffect(() => {
    charger()
  }, [charger])

  return { lignes, loading, recharger: charger }
}
