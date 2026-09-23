import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type SessionReport = Database['public']['Tables']['session_reports']['Row']
type SessionSatisfaction = Database['public']['Tables']['session_satisfaction']['Row']

export interface DetailSeance {
  compteRendu: SessionReport | null
  satisfactions: SessionSatisfaction[]
}

/* Compte rendu et enquêtes de satisfaction d'UNE séance, chargés à l'ouverture de sa fiche.
   Volontairement hors du cache partagé (useCacheRequete) : ces deux tables ne sont lues que
   pour la séance qu'on vient de cliquer, et les garder en cache par identifiant remplirait la
   mémoire d'entrées jamais relues. Ce que la RLS laisse voir dépend de qui regarde (0033,
   0068) — un professeur ne verra que ses propres séances, sans filtre supplémentaire ici. */
export function useDetailSeance(sessionId: string | null) {
  const [detail, setDetail] = useState<DetailSeance | null>(null)
  const [loading, setLoading] = useState(false)

  const charger = useCallback(async () => {
    if (!sessionId) {
      setDetail(null)
      return
    }
    setLoading(true)
    const [{ data: rapport }, { data: satisfactions }] = await Promise.all([
      supabase.from('session_reports').select('*').eq('session_id', sessionId).maybeSingle(),
      supabase.from('session_satisfaction').select('*').eq('session_id', sessionId),
    ])
    setDetail({ compteRendu: rapport ?? null, satisfactions: satisfactions ?? [] })
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    charger()
  }, [charger])

  return { detail, loading, recharger: charger }
}
