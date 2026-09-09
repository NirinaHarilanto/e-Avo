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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
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
