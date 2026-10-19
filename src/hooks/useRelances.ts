import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type Relance = Database['public']['Tables']['relances']['Row']

/* Historique des relances d'un prospect ou d'un étudiant (0130, demandes client 2, 4 et 7 du
   2026-10-19 : « rajoute une historique de relance car plusieurs relances seraient possibles »).

   Un seul hook pour les deux cibles : la table n'en distingue qu'une colonne, et l'affichage est
   le même (voir HistoriqueRelances). `cible` à `undefined` suspend la requête — la fiche d'un
   prospect se monte avant d'avoir son identifiant.

   Journal réservé à l'administration (policy `relances_admin_all`) : appelé depuis un espace
   professeur ou étudiant, il ne renverrait rien. */
export function useRelances(cible: { prospectId: string } | { studentId: string } | undefined) {
  const colonne = cible && 'prospectId' in cible ? 'prospect_id' : 'student_id'
  const valeurCible = cible ? ('prospectId' in cible ? cible.prospectId : cible.studentId) : undefined

  const { valeur, loading, erreur, recharger } = useCacheRequete(
    valeurCible && `relances-${colonne}-${valeurCible}`,
    async () => {
      const { data, error } = await supabase
        .from('relances')
        .select('*')
        .eq(colonne, valeurCible as string)
        .order('envoyee_le', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  )

  return { relances: valeur ?? [], loading, erreur, recharger }
}
