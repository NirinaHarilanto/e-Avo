import type { StatutPaiement, TypeProgrammeProspect } from '../types/database.types'

/* Libellé du type de programme d'un forfait. Centralisé ici (2026-10-13) après avoir trouvé la
   même table recopiée dans quatre écrans, et DEUX endroits où le ternaire
   `type_programme === 'duo' ? 'Duo' : 'Individuel'` affichait un forfait COLLECTIF comme
   « Individuel » — il n'y a pas deux types de forfait mais trois. */
export const LABEL_TYPE_PROGRAMME: Record<TypeProgrammeProspect, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

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
  // Une ligne explicitement soldée en base le reste, même à montant nul (geste commercial).
  if (ligne.statut === 'paye') return 'paye'
  /* `montant > 0` obligatoire avant de conclure « Payé » par comparaison (incident du
     2026-10-13) : un forfait dont le prix n'a jamais été renseigné arrive ici avec un montant
     ramené à 0, et `0 >= 0` le faisait passer pour payé alors que RIEN n'avait été encaissé —
     c'était le cas de tous les forfaits collectifs, dont `packages.montant` reste null parce que
     le prix est porté par une ligne de frais séparée. Même garde-fou que `construireSuiviCollectif`
     (src/lib/suiviCollectif.ts), qui exigeait déjà `montantFrais > 0` de son côté. */
  if (ligne.montant > 0 && ligne.montant_regle >= ligne.montant) return 'paye'
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

/* Rapprochement de l'ÉCHÉANCIER et de ce qui a RÉELLEMENT été encaissé — signalé par le client
   le 2026-10-31, capture à l'appui : une ligne soldée (« Payé », reste 0 Ar) affichait en même
   temps « Planifié et non réglé : 600 000 Ar sur 0,00 Ar restant dus ». Les deux registres
   vivaient côte à côte sans jamais se comparer : l'échéance annonce ce qui reste à encaisser
   (0070), l'acompte constate ce qui l'a été (0049), et rien ne les rapprochait.

   Ce verdict est ce qui manquait. Il ne CORRIGE rien tout seul — un versement qui solde une
   échéance sans qu'on l'ait cochée reste un geste d'admin, et c'est voulu : un acompte ne
   correspond pas toujours à une échéance (règlement anticipé, montant arrondi). Il nomme
   simplement la situation, y compris quand elle est contradictoire. */
export type VerdictEcheancier =
  /* Rien de planifié, et plus rien à encaisser : la ligne est close. */
  | { cas: 'soldee' }
  /* Rien de planifié, mais il reste à encaisser : l'échéancier est à remplir. */
  | { cas: 'a_planifier'; resteDu: number }
  /* Le reste dû est intégralement couvert par des échéances. */
  | { cas: 'couvert'; planifie: number }
  /* Une partie seulement du reste dû est planifiée. */
  | { cas: 'partiel'; planifie: number; aPlanifier: number }
  /* Plus planifié qu'il n'en reste à encaisser : soit une échéance a déjà été réglée par un
     acompte sans avoir été cochée, soit le montant a été saisi deux fois (une fois en acompte,
     une fois en échéance). C'est le cas que l'écran doit mettre en avant. */
  | { cas: 'excedent'; planifie: number; excedent: number; resteDu: number }

export function verdictEcheancier(planifie: number, resteDu: number): VerdictEcheancier {
  const planifieNet = Math.max(0, arrondi(planifie))
  const reste = Math.max(0, arrondi(resteDu))
  if (planifieNet === 0) return reste === 0 ? { cas: 'soldee' } : { cas: 'a_planifier', resteDu: reste }
  if (planifieNet > reste) {
    return { cas: 'excedent', planifie: planifieNet, excedent: arrondi(planifieNet - reste), resteDu: reste }
  }
  if (planifieNet === reste) return { cas: 'couvert', planifie: planifieNet }
  return { cas: 'partiel', planifie: planifieNet, aPlanifier: arrondi(reste - planifieNet) }
}

/* Acompte proposé par défaut dans la fenêtre de détail : le solde restant, la situation la
   plus courante. Un acompte partiel se saisit en corrigeant cette valeur. */
export function acompteSuggere(ligne: LignePayable): number {
  return resteAPayer(ligne)
}

export function formaterMontant(valeur: number, devise = 'Ar'): string {
  return `${arrondi(valeur).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${devise}`
}
