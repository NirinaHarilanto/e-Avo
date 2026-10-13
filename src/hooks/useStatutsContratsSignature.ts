import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { StatutSignatureContrat } from '../components/shared/BadgeStatutContrat'

/* Résume, pour une liste de profils (professeurs ou étudiants), leur situation vis-à-vis de la
   signature de contrat : `signe` si au moins un de leurs contrats est intégralement signé,
   `en_attente` s'ils en ont un en brouillon ou envoyé mais aucun signé, `aucun` s'ils n'ont
   aucun contrat (ou seulement des contrats résiliés). Utilisé par les listes Professeurs et
   Étudiants de l'espace admin pour repérer, sans ouvrir chaque fiche, qui n'a pas encore signé
   avant le début des cours. */
export function useStatutsContratsSignature(profileIds: string[]) {
  const [statuts, setStatuts] = useState<Record<string, StatutSignatureContrat>>({})
  const cleIds = profileIds.join(',')

  useEffect(() => {
    if (!cleIds) {
      setStatuts({})
      return
    }
    const ids = cleIds.split(',')
    /* Sans filtre `in(ids)` (optimisation du 2026-10-13) : attendre la liste des personnes avant
       de partir ajoutait une vague de requêtes au chemin critique des listes Étudiants et
       Professeurs, pour une table que la RLS borne déjà à l'établissement et qui tient en quelques
       dizaines de lignes. La requête part donc immédiatement, en parallèle de la liste, et le
       regroupement ci-dessous ne retient que les personnes demandées. */
    supabase
      .from('contracts')
      .select('destinataire_profile_id, statut')
      .then(({ data }) => {
        const parPersonne = new Map<string, string[]>()
        for (const ligne of data ?? []) {
          const liste = parPersonne.get(ligne.destinataire_profile_id) ?? []
          liste.push(ligne.statut)
          parPersonne.set(ligne.destinataire_profile_id, liste)
        }
        const resultat: Record<string, StatutSignatureContrat> = {}
        for (const id of ids) {
          const liste = parPersonne.get(id) ?? []
          if (liste.includes('signe')) resultat[id] = 'signe'
          else if (liste.some((s) => s === 'brouillon' || s === 'envoye')) resultat[id] = 'en_attente'
          else resultat[id] = 'aucun'
        }
        setStatuts(resultat)
      })
  }, [cleIds])

  return statuts
}
