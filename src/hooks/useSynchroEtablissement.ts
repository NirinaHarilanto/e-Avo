import { useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { declencherSynchroLocale, definirEmetteurSynchro } from '../lib/synchro'

/* Canal Broadcast `synchro:<etablissement_id>` (voir src/lib/synchro.ts), ouvert une seule fois
   pour toute la session dans ProfileContext. `self: false` : l'onglet qui écrit a déjà rechargé
   ses propres données après sa mutation, seuls les AUTRES navigateurs (et autres onglets) ont
   besoin du signal.

   À la reconnexion du canal (veille de l'ordinateur, réseau coupé), un rechargement est déclenché
   aussi : les signaux émis pendant la coupure sont perdus, pas les données. */
export function useSynchroEtablissement(etablissementId: string | null | undefined) {
  useEffect(() => {
    if (!etablissementId) return
    let dejaAbonne = false
    const canal = supabase
      .channel(`synchro:${etablissementId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'changement' }, () => declencherSynchroLocale())
      .subscribe((etat) => {
        if (etat !== 'SUBSCRIBED') return
        if (dejaAbonne) declencherSynchroLocale()
        dejaAbonne = true
      })
    definirEmetteurSynchro(() => {
      void canal.send({ type: 'broadcast', event: 'changement', payload: {} })
    })

    /* Retour sur un onglet resté en arrière-plan : le navigateur a pu suspendre le WebSocket. */
    function surVisibilite() {
      if (!document.hidden) declencherSynchroLocale()
    }
    document.addEventListener('visibilitychange', surVisibilite)

    return () => {
      definirEmetteurSynchro(null)
      document.removeEventListener('visibilitychange', surVisibilite)
      void supabase.removeChannel(canal)
    }
  }, [etablissementId])
}
