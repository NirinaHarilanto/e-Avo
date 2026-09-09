import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

export function useProfile(session: Session | null) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
  }, [session])

  return { profile, loading }
}
