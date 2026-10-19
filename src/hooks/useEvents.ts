import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type Event = Database['public']['Tables']['events']['Row']

/* Événements PUBLIÉS, pour la section Events de la vitrine (0130, demande client du 2026-10-19).
   Lisible sans être connecté : la policy `events_public_select` ne laisse passer que
   `statut = 'publie'`, un brouillon n'est donc jamais exposé — ce n'est pas ce `eq` qui protège,
   c'est la RLS ; il est là pour que la requête soit explicite sur ce qu'elle demande.

   Les événements à venir d'abord, du plus proche au plus lointain, puis les passés du plus récent
   au plus ancien : c'est l'ordre qui a du sens pour un visiteur, et il ne dépend d'aucun réglage.
   `ordre` tranche les ex æquo, pour que l'admin puisse mettre en avant l'un de deux événements
   du même jour. */
export function useEventsPublies() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('events-publies', async () => {
    const { data, error } = await supabase.from('events').select('*').eq('statut', 'publie').order('debut', { ascending: true })
    if (error) throw new Error(error.message)

    const maintenant = Date.now()
    const aVenir = (data ?? []).filter((e) => new Date(e.debut).getTime() >= maintenant)
    const passes = (data ?? []).filter((e) => new Date(e.debut).getTime() < maintenant).reverse()
    return {
      aVenir: aVenir.sort((a, b) => a.debut.localeCompare(b.debut) || a.ordre - b.ordre),
      passes,
    }
  })

  return { aVenir: valeur?.aVenir ?? [], passes: valeur?.passes ?? [], loading, erreur, recharger }
}

/* Tous les événements de l'établissement, brouillons compris — réservé à l'espace admin (la RLS
   ne rend les brouillons qu'à un administrateur). Les plus récents d'abord : c'est ce que l'admin
   vient de créer qu'il veut retrouver.

   `maintenant` est l'instant de la requête, renvoyé avec les données : c'est lui qui sert à dire
   qu'un événement est « déjà passé ». Lire l'heure dans le rendu donnerait une valeur différente
   à chaque réaffichage, et des lignes qui ne s'accordent pas avec les compteurs de la page. */
export function useTousLesEvents() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('events-tous', async () => {
    const { data, error } = await supabase.from('events').select('*').order('debut', { ascending: false })
    if (error) throw new Error(error.message)
    return { events: data ?? [], maintenant: Date.now() }
  })

  return { events: valeur?.events ?? [], maintenant: valeur?.maintenant ?? 0, loading, erreur, recharger }
}

/* URL publique de l'image d'un événement. Le bucket `events` est public précisément pour ce cas :
   la section est servie à un visiteur anonyme, qui n'a aucun jeton pour demander une URL signée
   (même raison que `photos-profil`, 0128). */
export function urlImageEvent(imagePath: string | null): string | null {
  if (!imagePath) return null
  return supabase.storage.from('events').getPublicUrl(imagePath).data.publicUrl
}
