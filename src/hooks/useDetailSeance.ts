import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type SessionReport = Database['public']['Tables']['session_reports']['Row']

export interface DetailSeance {
  compteRendu: SessionReport | null
}

/* Compte rendu d'UNE séance, chargé à l'ouverture de sa fiche. Volontairement hors du cache
   partagé (useCacheRequete) : cette table n'est lue que pour la séance qu'on vient de cliquer, et
   la garder en cache par identifiant remplirait la mémoire d'entrées jamais relues. Ce que la RLS
   laisse voir dépend de qui regarde (0033) — un professeur ne verra que ses propres séances, sans
   filtre supplémentaire ici.

   Les enquêtes de satisfaction ont quitté ce hook le 2026-10-19 : elles ne portent plus sur une
   séance mais sur deux jalons du parcours (demande client 8, voir useJalonsParcours). */
export function useDetailSeance(sessionId: string | null) {
  const [detail, setDetail] = useState<DetailSeance | null>(null)
  const [loading, setLoading] = useState(false)

  const charger = useCallback(async () => {
    if (!sessionId) {
      setDetail(null)
      return
    }
    setLoading(true)
    const { data: rapport } = await supabase.from('session_reports').select('*').eq('session_id', sessionId).maybeSingle()
    setDetail({ compteRendu: rapport ?? null })
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    charger()
  }, [charger])

  return { detail, loading, recharger: charger }
}
