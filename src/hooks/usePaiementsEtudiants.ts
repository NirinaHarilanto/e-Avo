import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type StudentPayment = Database['public']['Tables']['student_payments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Package = Database['public']['Tables']['packages']['Row']

export interface PaiementEtudiant {
  paiement: StudentPayment
  etudiant: Profile | null
  forfait: Package | null
}

export function usePaiementsEtudiants() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('paiements-etudiants', async () => {
    const { data, error } = await supabase
      .from('student_payments')
      .select('*')
      .order('date_echeance', { ascending: true, nullsFirst: false })
    if (error) throw new Error(error.message)

    const studentIds = [...new Set((data ?? []).map((p) => p.student_id))]
    const packageIds = [...new Set((data ?? []).map((p) => p.package_id).filter((id): id is string => !!id))]
    const [{ data: etudiants }, { data: forfaits }] = await Promise.all([
      studentIds.length ? supabase.from('profiles').select('*').in('id', studentIds) : Promise.resolve({ data: [] as Profile[] }),
      packageIds.length ? supabase.from('packages').select('*').in('id', packageIds) : Promise.resolve({ data: [] as Package[] }),
    ])
    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))
    const forfaitParId = new Map((forfaits ?? []).map((f) => [f.id, f]))

    return (data ?? []).map((paiement): PaiementEtudiant => ({
      paiement,
      etudiant: etudiantParId.get(paiement.student_id) ?? null,
      forfait: paiement.package_id ? (forfaitParId.get(paiement.package_id) ?? null) : null,
    }))
  })

  return { paiements: valeur ?? [], loading, erreur, recharger }
}
