import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

/* `authLoading` retarde ce hook tant que `useAuth` n'a pas fini de résoudre la session au
   chargement de la page. Sans ça, ce hook voit `session === null` sur le tout premier rendu
   (avant que `getSession()` ait répondu) et pose `loading = false` avec `profile = null` —
   puis, dès que la vraie session arrive, il reste un rendu où `authLoading` est déjà passé à
   false mais où l'effet ci-dessous n'a pas encore eu la chance de repasser `loading` à true
   pour cette nouvelle session. Un composant consommateur (ex. AdminLayout) qui lit
   `!session || !profile` pendant cette fenêtre voit un utilisateur connecté sans profil et le
   redirige à tort vers /connexion, avant que la redirection inverse ne le renvoie plus loin —
   un aller-retour visible au moindre rechargement de page sur une route protégée. */
export function useProfile(session: Session | null, authLoading: boolean) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!session) {
      setProfile(null)
      setLoading(false)
      return
    }

    let annule = false
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!annule) {
          setProfile(data)
          setLoading(false)
        }
      })

    return () => {
      annule = true
    }
  }, [session, authLoading])

  return { profile, loading }
}
