import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Invoice = Database['public']['Tables']['invoices']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface FactureAvecDestinataire {
  facture: Invoice
  destinataire: Profile | null
}

/* Une facture pointe soit vers un étudiant (reçu de paiement, forfait…) soit vers un
   professeur (rémunération) — jamais les deux (contrainte invoices_destinataire_unique, 0029).
   Un seul hook/une seule requête, le destinataire est résolu quel que soit le côté renseigné. */
export function useFactures() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('factures', async () => {
    const { data, error } = await supabase.from('invoices').select('*').order('date_emission', { ascending: false })
    if (error) throw new Error(error.message)

    const profileIds = [...new Set((data ?? []).map((f) => f.student_id ?? f.teacher_id).filter((id): id is string => !!id))]
    const { data: profiles } = profileIds.length
      ? await supabase.from('profiles').select('*').in('id', profileIds)
      : { data: [] as Profile[] }
    const profilParId = new Map((profiles ?? []).map((p) => [p.id, p]))

    return (data ?? []).map((f): FactureAvecDestinataire => ({ facture: f, destinataire: profilParId.get(f.student_id ?? f.teacher_id ?? '') ?? null }))
  })

  return { factures: valeur ?? [], loading, erreur, recharger }
}
