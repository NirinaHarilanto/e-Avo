import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { chargerProfilsEtablissement, indexPartenairesDuo } from '../lib/profilsEtablissement'
import { useCacheRequete } from './useCacheRequete'

type Invoice = Database['public']['Tables']['invoices']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface FactureAvecDestinataire {
  facture: Invoice
  destinataire: Profile | null
  /* Partenaire DUO du destinataire élève (0054), quel que soit le sens du lien — demande client
     du 2026-09-23 reprise ici le 2026-10-16 : la page Facturation en était restée au nom du seul
     destinataire, autant dans ses lignes que sur les factures/reçus imprimés. Toujours `null`
     côté professeur, aucun n'a de duo_partenaire_id. */
  duoPartenaire: Profile | null
}

/* Une facture pointe soit vers un étudiant (reçu de paiement, forfait…) soit vers un
   professeur (rémunération) — jamais les deux (contrainte invoices_destinataire_unique, 0029).
   Un seul hook/une seule requête, le destinataire est résolu quel que soit le côté renseigné. */
export function useFactures() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('factures', async () => {
    /* Les profils partent EN MÊME TEMPS que les factures (optimisation du 2026-10-13) : les nommer
       demandait d'attendre les factures, ce qui faisait deux allers-retours successifs au lieu d'un
       — voir lib/profilsEtablissement.ts. */
    const [{ data, error }, profilsTous] = await Promise.all([
      supabase.from('invoices').select('*').order('date_emission', { ascending: false }),
      chargerProfilsEtablissement(),
    ])
    if (error) throw new Error(error.message)

    // Une facture rattachée à un compte supprimé disparaît de la liste (demande client du
    // 2026-09-23) — la ligne reste en base, réversible si la personne se réinscrit.
    const profilParId = new Map(profilsTous.filter((p) => p.status !== 'suspended').map((p) => [p.id, p]))
    const partenaireDe = indexPartenairesDuo(profilsTous)

    return (data ?? [])
      .filter((f) => profilParId.has(f.student_id ?? f.teacher_id ?? ''))
      .map((f): FactureAvecDestinataire => ({
        facture: f,
        destinataire: profilParId.get(f.student_id ?? f.teacher_id ?? '') ?? null,
        duoPartenaire: f.student_id ? partenaireDe(f.student_id) : null,
      }))
  })

  return { factures: valeur ?? [], loading, erreur, recharger }
}
