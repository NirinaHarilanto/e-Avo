import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export interface InscriptionInfos {
  email: string
  motDePasse: string
  etablissementId: string
  nom: string
  prenom: string
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let annule = false

    /* `getSession()` peut ÉCHOUER, pas seulement répondre « pas de session » : depuis
       supabase-js 2.x, la lecture de session passe par un verrou exclusif `navigator.locks`, qui
       lève `NavigatorLockAcquireTimeoutError` quand il ne peut pas être pris à temps — cas typique
       après une mise en veille de la machine ou quand un autre onglet a laissé le verrou coincé.
       Sans ce `catch`, la promesse rejetée laissait `loading` à `true` POUR TOUJOURS : chaque
       espace reste alors bloqué sur son écran « Chargement… » (EspaceLayout.tsx), symptôme signalé
       par le client le 2026-10-11 (« après un certain temps d'inactivité, l'écran bug »). Un seul
       nouvel essai, puis on rend la main : `onAuthStateChange` ci-dessous délivrera la session dès
       que l'authentification se rétablit, et l'utilisateur voit l'écran de connexion au lieu d'un
       chargement sans fin. */
    async function resoudreSession(reessayer: boolean) {
      try {
        const { data } = await supabase.auth.getSession()
        if (annule) return
        setSession(data.session)
        setLoading(false)
      } catch {
        if (annule) return
        if (reessayer) {
          setTimeout(() => {
            if (!annule) resoudreSession(false)
          }, 1500)
          return
        }
        setLoading(false)
      }
    }
    resoudreSession(true)

    /* supabase-js réémet un événement d'auth à chaque retour sur l'onglet (il écoute
       `visibilitychange` pour rafraîchir le jeton) avec un NOUVEL objet session, même quand
       rien n'a changé. Remplacer l'état par ce nouvel objet changeait l'identité de la valeur
       du ProfileContext et relançait les effets qui en dépendent — d'où l'écran de chargement
       qui réapparaissait dès qu'on revenait sur la fenêtre. On ne remplace donc la session que
       lorsqu'elle change réellement (autre utilisateur, ou jeton effectivement renouvelé). */
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession((precedente) =>
        precedente?.access_token === nextSession?.access_token && precedente?.user.id === nextSession?.user.id ? precedente : nextSession,
      )
    })

    return () => {
      annule = true
      listener.subscription.unsubscribe()
    }
  }, [])

  async function seConnecter(email: string, motDePasse: string) {
    return supabase.auth.signInWithPassword({ email, password: motDePasse })
  }

  async function sInscrire(infos: InscriptionInfos) {
    return supabase.auth.signUp({
      email: infos.email,
      password: infos.motDePasse,
      options: {
        // Seule valeur de metadata à laquelle le trigger d'inscription fait confiance
        // (voir supabase/migrations/0002_profiles_and_trigger.sql) : le rôle n'est jamais
        // lu depuis les metadata client.
        data: {
          etablissement_id: infos.etablissementId,
          nom: infos.nom,
          prenom: infos.prenom,
        },
      },
    })
  }

  async function seDeconnecter() {
    return supabase.auth.signOut()
  }

  return { session, loading, seConnecter, sInscrire, seDeconnecter }
}
