import type { Database } from '../types/database.types'

type VideoSession = Database['public']['Tables']['video_sessions']['Row']

/* Interface unique de visioconférence (décision actée avec le client : intégration reportée,
   schéma et UI prêts dès maintenant derrière un stub configurable). Le jour où un prestataire
   réel est choisi (Daily.co pressenti), seules ces deux fonctions changent — aucun composant
   appelant ne doit être modifié. */

export function getJoinUrl(videoSession: Pick<VideoSession, 'room_ref' | 'provider'>): string {
  if (videoSession.provider === 'stub' || !videoSession.provider) {
    return `https://meet.e-avo.example/salle/${videoSession.room_ref}`
  }
  return `https://meet.e-avo.example/salle/${videoSession.room_ref}`
}

export function getRecordingUrl(videoSession: Pick<VideoSession, 'enregistrement_url'>): string | null {
  return videoSession.enregistrement_url
}
