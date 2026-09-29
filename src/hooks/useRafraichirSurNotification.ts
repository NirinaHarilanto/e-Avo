import { useEffect, useRef } from 'react'
import type { Database } from '../types/database.types'

type Notification = Database['public']['Tables']['notifications']['Row']

/* Couche 2 de la stratégie temps réel du 2026-09-29 : plutôt qu'un canal Realtime par table
   affichée par chaque page (Prospects, Agenda, Séances...), toute page qui affiche des données
   déjà couvertes par une notification métier existante (voir api/_lib/notifications.ts,
   `creerNotification()` déjà appelée à 14 endroits) peut simplement dire « quand une notification
   d'un de ces types arrive, relance mon chargement » — elle réutilise le canal déjà ouvert une
   seule fois dans ProfileContext (useNotificationsTempsReel.ts) au lieu d'en ouvrir un nouveau.

   `dernierEvenement` vaut le même objet tant qu'aucune notification n'est arrivée depuis le
   montage : la ref évite de rappeler `recharger` en boucle à chaque rendu tant que l'identifiant
   de la dernière notification traitée n'a pas changé. */
export function useRafraichirSurNotification(
  dernierEvenement: Notification | null,
  types: readonly string[],
  recharger: () => void,
) {
  const dernierTraiteId = useRef<string | null>(null)
  const rechargerRef = useRef(recharger)
  rechargerRef.current = recharger

  useEffect(() => {
    if (!dernierEvenement || dernierEvenement.id === dernierTraiteId.current) return
    dernierTraiteId.current = dernierEvenement.id
    if (types.includes(dernierEvenement.type)) rechargerRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dernierEvenement])
}
