import { supabase } from '../lib/supabaseClient'
import type { Database, ProspectStatut } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

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
  const { valeur, loading, erreur, recharger } = useCacheRequete('prospects-pipeline', async () => {
    const [{ data: prospectsData, error: prospectsError }, { data: diagnosticsData, error: diagnosticsError }] = await Promise.all([
      supabase.from('prospects').select('*').order('created_at', { ascending: false }),
      supabase.from('diagnostic_calls').select('*').order('created_at', { ascending: false }),
    ])
    if (prospectsError || diagnosticsError) throw new Error((prospectsError ?? diagnosticsError)?.message ?? 'Erreur de chargement.')

    const diagnosticParProspect = new Map<string, DiagnosticCall>()
    for (const diagnostic of diagnosticsData ?? []) {
      if (!diagnosticParProspect.has(diagnostic.prospect_id)) {
        diagnosticParProspect.set(diagnostic.prospect_id, diagnostic)
      }
    }

    return (prospectsData ?? []).map((prospect): ProspectAvecDiagnostic => ({
      ...prospect,
      diagnostic: diagnosticParProspect.get(prospect.id) ?? null,
    }))
  })

  return { prospects: valeur ?? [], loading, erreur, recharger }
}
