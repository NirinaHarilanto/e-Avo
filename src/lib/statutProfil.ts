import type { ProfileStatus } from '../types/database.types'

/* Libellé et teinte affichés pour le statut d'un compte (étudiant ou professeur) — un seul
   endroit pour les deux, plutôt que le ternaire `status === 'approved' ? 'Actif' : status` recopié
   à chaque liste/dossier, qui laissait fuiter la valeur brute de l'enum (`en_pause`, `pending`)
   telle quelle à l'écran dès qu'un statut autre que ces deux-là existait (0063, demande client du
   2026-09-23 : mise en pause). */
export function libelleStatutProfil(status: ProfileStatus): string {
  switch (status) {
    case 'approved':
      return 'Actif'
    case 'pending':
      return 'En attente d’activation'
    case 'en_pause':
      return 'En pause'
    case 'suspended':
      return 'Supprimé'
  }
}

export function tonStatutProfil(status: ProfileStatus): { color: string; bg: string; border: string } {
  switch (status) {
    case 'approved':
      return { color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.32)' }
    case 'en_pause':
      return { color: 'var(--warning)', bg: 'rgba(233,207,148,.14)', border: 'rgba(233,207,148,.32)' }
    case 'pending':
    case 'suspended':
      return { color: 'var(--muted)', bg: 'rgba(255,255,255,.04)', border: 'var(--border)' }
  }
}
