import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database, ProspectStatut } from '../types/database.types'

type Prospect = Database['public']['Tables']['prospects']['Row']
type DiagnosticCall = Database['public']['Tables']['diagnostic_calls']['Row']

export interface ProspectAvecDiagnostic extends Prospect {
  diagnostic: DiagnosticCall | null
}

export const COLONNES_PIPELINE: { statut: ProspectStatut; titre: string }[] = [
  { statut: 'prospect', titre: 'Nouveaux prospects' },
  { statut: 'diagnostic_planifie', titre: 'Appel diagnostic planifié' },
  { statut: 'diagnostic_fait', titre: 'Diagnostic réalisé' },
  { statut: 'etudiant', titre: 'Étudiant' },
]

export function useProspectsPipeline() {
  const [prospects, setProspects] = useState<ProspectAvecDiagnostic[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const recharger = useCallback(async () => {
    setLoading(true)
    setErreur(null)
    const [{ data: prospectsData, error: prospectsError }, { data: diagnosticsData, error: diagnosticsError }] =
      await Promise.all([
        supabase.from('prospects').select('*').order('created_at', { ascending: false }),
        supabase.from('diagnostic_calls').select('*').order('created_at', { ascending: false }),
      ])

    if (prospectsError || diagnosticsError) {
      setErreur((prospectsError ?? diagnosticsError)?.message ?? 'Erreur de chargement.')
      setLoading(false)
      return
    }

    const diagnosticParProspect = new Map<string, DiagnosticCall>()
    for (const diagnostic of diagnosticsData ?? []) {
      if (!diagnosticParProspect.has(diagnostic.prospect_id)) {
        diagnosticParProspect.set(diagnostic.prospect_id, diagnostic)
      }
    }

    setProspects(
      (prospectsData ?? []).map((prospect) => ({
        ...prospect,
        diagnostic: diagnosticParProspect.get(prospect.id) ?? null,
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    recharger()
  }, [recharger])

  return { prospects, loading, erreur, recharger }
}
