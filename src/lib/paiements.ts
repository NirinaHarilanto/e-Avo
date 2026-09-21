import type { StatutPaiement } from '../types/database.types'

/* Règlement d'une ligne de paiement, du point de vue du client : « À payer », « Payé
   partiellement », « Payé ». Ces trois états ne sont pas des valeurs de l'enum
   `statut_paiement` — ils se déduisent du cumul des versements (`montant_regle`, tenu à jour
   par trigger, migration 0049). Calcul isolé ici, sans React ni requête, parce qu'il est lu
   par la liste des paiements, la fenêtre de détail et les totaux de la page, qui doivent tous
   afficher exactement la même chose. */

export type StatutReglement = 'a_payer' | 'partiel' | 'paye' | 'en_retard' | 'annule'

export interface LignePayable {
  montant: number
  montant_regle: number
  statut: StatutPaiement
}

export const LABELS_REGLEMENT: Record<StatutReglement, string> = {
  a_payer: 'À payer',
  partiel: 'Payé partiellement',
  paye: 'Payé',
  en_retard: 'En retard',
  annule: 'Annulé',
}

export function statutReglement(ligne: LignePayable): StatutReglement {
  if (ligne.statut === 'annule') return 'annule'
  if (ligne.statut === 'paye' || ligne.montant_regle >= ligne.montant) return 'paye'
  /* Un acompte déjà encaissé prime sur « en retard » : l'information utile est qu'il reste
     quelque chose à percevoir, et le reste dû exact s'affiche à côté. */
  if (ligne.montant_regle > 0) return 'partiel'
  if (ligne.statut === 'en_retard') return 'en_retard'
  return 'a_payer'
}

export function resteAPayer(ligne: LignePayable): number {
  return Math.max(0, arrondi(ligne.montant - ligne.montant_regle))
}

/* Les montants viennent de colonnes numeric et de saisies utilisateur : sans arrondi, une
   suite d'acomptes laisse des restes à payer du type 0.000000001 qui empêchent une ligne de
   passer à « Payé ». */
export function arrondi(valeur: number): number {
  return Math.round(valeur * 100) / 100
}

/* Acompte proposé par défaut dans la fenêtre de détail : le solde restant, la situation la
   plus courante. Un acompte partiel se saisit en corrigeant cette valeur. */
export function acompteSuggere(ligne: LignePayable): number {
  return resteAPayer(ligne)
}

export function formaterMontant(valeur: number, devise = 'Ar'): string {
  return `${arrondi(valeur).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${devise}`
}
