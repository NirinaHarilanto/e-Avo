import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type PlatformAdmin = Database['public']['Tables']['platform_admins']['Row']

/* Vérifie si l'utilisateur connecté est un admin plateforme. `contextLoading` doit être le
   `loading` déjà combiné de ProfileContext (authLoading || profileLoading) : tant qu'il est
   true, session peut encore changer, donc on ne interroge pas encore — une fois false, session
   est stable et fiable à interroger (même précaution que useProfile.ts vis-à-vis de useAuth,
   un niveau plus haut). Appelé uniquement dans PlateformeLayout, pas dans ProfileContext —
   évite une requête Supabase supplémentaire à chaque page pour les sessions qui ne sont
   jamais admin plateforme. */
export function usePlatformAdmin(session: Session | null, contextLoading: boolean) {
  const [platformAdmin, setPlatformAdmin] = useState<PlatformAdmin | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (contextLoading) return

    if (!session) {
      setPlatformAdmin(null)
      setLoading(false)
      return
    }

    let annule = false
    setLoading(true)
    supabase
      .from('platform_admins')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!annule) {
          setPlatformAdmin(data)
          setLoading(false)
        }
      })

    return () => {
      annule = true
    }
  }, [session, contextLoading])

  return { platformAdmin, loading }
}
