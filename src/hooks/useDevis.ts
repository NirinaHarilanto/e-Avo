import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Quote = Database['public']['Tables']['quotes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface DevisAvecEtudiant {
  devis: Quote
  etudiant: Profile | null
}

export function useDevis() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('devis', async () => {
    const { data, error } = await supabase.from('quotes').select('*').order('date_emission', { ascending: false })
    if (error) throw new Error(error.message)

    const studentIds = [...new Set((data ?? []).map((d) => d.student_id))]
    // Un devis rattaché à un compte supprimé disparaît de la liste (demande client du
    // 2026-09-23) — la ligne reste en base, réversible si la personne se réinscrit.
    const { data: etudiants } = studentIds.length
      ? await supabase.from('profiles').select('*').in('id', studentIds).neq('status', 'suspended')
      : { data: [] as Profile[] }
    const etudiantParId = new Map((etudiants ?? []).map((e) => [e.id, e]))

    return (data ?? [])
      .filter((d) => etudiantParId.has(d.student_id))
      .map((d): DevisAvecEtudiant => ({ devis: d, etudiant: etudiantParId.get(d.student_id) ?? null }))
  })

  return { devis: valeur ?? [], loading, erreur, recharger }
}
