import type { Database } from '../types/database.types'

type VideoSession = Database['public']['Tables']['video_sessions']['Row']

/* Interface unique de visioconférence, appelée partout où un lien « Rejoindre » est affiché.
   Deux fournisseurs coexistent volontairement :

   - `google_meet` : l'établissement a connecté son compte Google (voir ParametresAdmin), chaque
     séance a reçu un vrai lien meet.google.com créé avec son événement Calendar. `room_ref`
     contient alors le lien complet, il n'y a rien à reconstruire.
   - `stub` : aucun compte Google connecté. Le lien reste factice, comme avant l'intégration —
     les séances déjà créées ainsi gardent ce lien jusqu'à ce qu'un admin le régénère depuis la
     page Séances. */

export function getJoinUrl(videoSession: Pick<VideoSession, 'room_ref' | 'provider'>): string {
  if (videoSession.provider === 'google_meet' && videoSession.room_ref) {
    return videoSession.room_ref
  }
  return `https://meet.e-avo.example/salle/${videoSession.room_ref}`
}

export function estLienReel(videoSession: Pick<VideoSession, 'room_ref' | 'provider'>): boolean {
  return videoSession.provider === 'google_meet' && Boolean(videoSession.room_ref)
}

export function getRecordingUrl(videoSession: Pick<VideoSession, 'enregistrement_url'>): string | null {
  return videoSession.enregistrement_url
}
