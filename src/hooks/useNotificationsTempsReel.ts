import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Notification = Database['public']['Tables']['notifications']['Row']

const LIMITE = 30

/* Cœur temps réel des notifications (demande client du 2026-09-29, couche 1 de la stratégie
   discutée : « recevoir les mises à jour et notifications sans devoir rafraîchir »). Jusqu'ici la
   cloche (NotificationsBell.tsx) ne chargeait qu'une fois au montage, jamais réinterrogée.

   Vit dans ProfileContext (monté une seule fois pour toute l'application, jamais démonté entre
   deux pages — voir son commentaire), pas dans NotificationsBell.tsx elle-même : un seul
   abonnement Supabase Realtime par session, même si la cloche venait un jour à être montée
   plusieurs fois. La policy `notifications_destinataire_select` (0028, `destinataire_profile_id
   = auth.uid()`) est déjà compatible telle quelle — Realtime respecte RLS — il ne manquait que
   l'ajout de la table à la publication `supabase_realtime` (migration 0083).

   `dernierEvenement` est le signal générique que réutilise useRafraichirSurNotification.ts
   (couche 2) : une page qui affiche des données déjà couvertes par une notification métier
   existante (nouveau prospect, séance déplacée...) peut se recharger sans ouvrir son propre
   canal Realtime. */
export function useNotificationsTempsReel(profileId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [dernierEvenement, setDernierEvenement] = useState<Notification | null>(null)

  const charger = useCallback(async () => {
    if (!profileId) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('destinataire_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(LIMITE)
    setNotifications(data ?? [])
    setLoading(false)
  }, [profileId])

  useEffect(() => {
    charger()
  }, [charger])

  useEffect(() => {
    if (!profileId) return
    const canal = supabase
      .channel(`notifications-${profileId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `destinataire_profile_id=eq.${profileId}` },
        (payload) => {
          const nouvelle = payload.new as Notification
          setNotifications((n) => (n.some((x) => x.id === nouvelle.id) ? n : [nouvelle, ...n].slice(0, LIMITE)))
          setDernierEvenement(nouvelle)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [profileId])

  async function marquerLue(id: string) {
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, lu: true } : x)))
    await supabase.from('notifications').update({ lu: true }).eq('id', id)
  }

  const nonLues = notifications.filter((n) => !n.lu).length

  return { notifications, nonLues, loading, marquerLue, recharger: charger, dernierEvenement }
}
