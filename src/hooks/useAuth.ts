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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

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

    return () => listener.subscription.unsubscribe()
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
