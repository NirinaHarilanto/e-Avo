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

/* Activité d'un ÉTUDIANT, redéfinie le 2026-10-19 : « l'étudiant serait inactif lorsque son
   forfait d'heures est épuisé, ou lorsqu'il fait une pause [...] dans les autres cas, il serait
   actif ».
   Distinct de `profiles.status`, qui ne connaît pas les heures : un élève dont le forfait est
   épuisé reste `approved` en base — son compte fonctionne, c'est son parcours qui est à l'arrêt.
   Le statut du compte continue de l'emporter dans deux cas qui ne sont pas des questions
   d'activité : une invitation jamais acceptée (`pending`) n'est pas un parcours inactif mais un
   compte pas encore ouvert, et c'est déjà compté à part dans les écrans ; un compte supprimé
   (`suspended`) ne figure dans aucune liste. */
export type ActiviteEtudiant = 'actif' | 'inactif' | 'en_attente' | 'supprime'

export function activiteEtudiant(params: {
  status: ProfileStatus
  /* À `true` quand toutes les heures souscrites sont consommées. Calculé par l'appelant, qui
     seul connaît le forfait applicable — cumul des souscriptions en individuel/duo, forfait de la
     vague en collectif (voir lib/heures.ts et lib/classesCollectif.ts). Un élève SANS forfait
     connu n'est jamais épuisé : ce serait déclarer à l'arrêt un parcours qui n'a pas commencé. */
  forfaitEpuise: boolean
}): ActiviteEtudiant {
  if (params.status === 'suspended') return 'supprime'
  if (params.status === 'pending') return 'en_attente'
  if (params.status === 'en_pause') return 'inactif'
  return params.forfaitEpuise ? 'inactif' : 'actif'
}

export function libelleActiviteEtudiant(activite: ActiviteEtudiant): string {
  switch (activite) {
    case 'actif':
      return 'Actif'
    case 'inactif':
      return 'Inactif'
    case 'en_attente':
      return 'En attente d’activation'
    case 'supprime':
      return 'Supprimé'
  }
}

export function tonActiviteEtudiant(activite: ActiviteEtudiant): { color: string; bg: string; border: string } {
  switch (activite) {
    case 'actif':
      return { color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.32)' }
    case 'inactif':
      return { color: 'var(--warning)', bg: 'rgba(233,207,148,.14)', border: 'rgba(233,207,148,.32)' }
    case 'en_attente':
    case 'supprime':
      return { color: 'var(--muted)', bg: 'rgba(255,255,255,.04)', border: 'var(--border)' }
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
