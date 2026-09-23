import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

/* Résout, pour une liste de profils principaux, leur éventuel second membre de binôme DUO
   (0054) — nécessaire là où on ne dispose pas déjà de la liste complète des étudiants de
   l'établissement (EtudiantsAdmin.tsx la déduit directement de `useEtudiants()`, mais un
   professeur n'a RLS que sur ses propres élèves assignés, et un secondaire DUO n'a justement
   aucune affectation/séance propre — il n'apparaîtrait jamais dans cette liste sans cette
   requête dédiée). Demande client du 2026-09-23 : « il faut que le bloc étudiant DUO soit repris
   exactement » dans l'espace professeur. */
export function useSecondairesDuo(principalIds: string[]) {
  const [secondaireParPrincipal, setSecondaireParPrincipal] = useState<Map<string, Profile>>(new Map())
  const cleIds = principalIds.join(',')

  useEffect(() => {
    if (!cleIds) {
      setSecondaireParPrincipal(new Map())
      return
    }
    supabase
      .from('profiles')
      .select('*')
      .in('duo_partenaire_id', cleIds.split(','))
      .then(({ data }) => {
        const table = new Map<string, Profile>()
        for (const secondaire of data ?? []) {
          if (secondaire.duo_partenaire_id) table.set(secondaire.duo_partenaire_id, secondaire)
        }
        setSecondaireParPrincipal(table)
      })
  }, [cleIds])

  return { secondaireParPrincipal }
}
