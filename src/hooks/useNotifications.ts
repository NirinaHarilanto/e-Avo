import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Notification = Database['public']['Tables']['notifications']['Row']

export function useNotifications(profileId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const charger = useCallback(async () => {
    if (!profileId) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('destinataire_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data ?? [])
    setLoading(false)
  }, [profileId])

  useEffect(() => {
    charger()
  }, [charger])

  async function marquerLue(id: string) {
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, lu: true } : x)))
    await supabase.from('notifications').update({ lu: true }).eq('id', id)
  }

  const nonLues = notifications.filter((n) => !n.lu).length

  return { notifications, nonLues, loading, marquerLue, recharger: charger }
}
