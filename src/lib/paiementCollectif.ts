/* Modalités de paiement propres aux cours COLLECTIFS — demande client du 2026-10-31 : « les prix
   affichés sont les prix mensuels pour une période de deux mois, donc les étudiants collectifs,
   soit paient en une seule fois le montant total soit paient par mois ».

   Ce que cela corrige. La grille des tarifs porte bien un prix mensuel (« 150 000 Ar/mois ·
   2 mois · … »), mais la fenêtre des frais d'inscription proposait ce prix TEL QUEL comme montant
   à encaisser : un élève collectif était enregistré pour la moitié de ce qu'il doit, et le suivi
   financier le comptait soldé. Le total est donc le prix mensuel multiplié par la durée du cycle.

   Volontairement pur (aucune requête, aucune horloge implicite : `depart` est toujours passé en
   paramètre), comme classesCollectif.ts et creneaux.ts : c'est la pièce qui décide de ce qu'on
   réclame à un élève, elle doit être vérifiable par des tests. Elle ne concerne QUE le collectif —
   un forfait individuel se règle en heures achetées, pas en mensualités. */

/* Durée d'un cycle de cours collectifs, en mois. La même valeur est écrite en toutes lettres dans
   la description des tarifs collectifs (« 2 mois · Lun, Mar, Jeu, Ven · 1h/séance ») et dans la
   page publique ; c'est ici qu'elle commande le calcul. */
export const MOIS_CYCLE_COLLECTIF = 2

export type ModalitePaiementCollectif = 'integral' | 'mensuel'

/* Montant total dû pour un cycle, à partir du prix mensuel de la grille. */
export function totalCycleCollectif(prixMensuel: number): number {
  return prixMensuel * MOIS_CYCLE_COLLECTIF
}

export interface EcheanceCollectif {
  libelle: string
  montant: number
  /* Jour de l'échéance, au format 'AAAA-MM-JJ' — jamais un instant : une échéance est une date
     civile, et passer par `toISOString()` reculerait le jour d'un cran à Madagascar (UTC+3). */
  date_echeance: string
}

function jourLocal(date: Date): string {
  const deuxChiffres = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}`
}

/**
 * Échéancier d'un paiement collectif mensualisé : une échéance par mois du cycle, la première au
 * jour du départ, les suivantes de mois en mois.
 *
 * Le dernier versement absorbe l'arrondi (`total - somme des précédents`) : sur un total de
 * 300 001 Ar, deux mensualités arrondies laisseraient 1 Ar introuvable, et la ligne ne serait
 * jamais soldée. C'est le même principe que l'échéancier individuel.
 *
 * Le 31 d'un mois qui n'existe pas au suivant est reporté par `Date` sur le mois d'après (le 31
 * mars + 1 mois donne le 1er mai) : accepté tel quel, l'écart d'un jour n'a aucune conséquence
 * sur une échéance que l'administration peut de toute façon corriger à la main.
 */
export function echeancierCollectif(total: number, depart: Date): EcheanceCollectif[] {
  const parMois = Math.round(total / MOIS_CYCLE_COLLECTIF)
  const echeances: EcheanceCollectif[] = []
  for (let mois = 0; mois < MOIS_CYCLE_COLLECTIF; mois++) {
    const date = new Date(depart.getFullYear(), depart.getMonth() + mois, depart.getDate())
    const dernier = mois === MOIS_CYCLE_COLLECTIF - 1
    echeances.push({
      libelle: `Mensualité ${mois + 1} sur ${MOIS_CYCLE_COLLECTIF}`,
      montant: dernier ? total - parMois * (MOIS_CYCLE_COLLECTIF - 1) : parMois,
      date_echeance: jourLocal(date),
    })
  }
  return echeances
}

/* Ce qui est effectivement encaissé à l'inscription, selon la modalité choisie et selon que
   l'élève a payé ou non : la totalité en paiement intégral, la seule première mensualité en
   paiement mensualisé. Le montant DÛ, lui, reste le total dans les deux cas — c'est l'engagement
   que l'élève signe (voir la lettre d'engagement, modèle de contrat ajouté le 2026-10-31). */
export function montantEncaisseALInscription(
  total: number,
  modalite: ModalitePaiementCollectif,
  regle: boolean,
): number {
  if (!regle) return 0
  if (modalite === 'integral') return total
  return premiereMensualite(total)
}

/* Montant de la première mensualité, indépendamment des dates : l'arrondi se joue sur la
   DERNIÈRE (voir `echeancierCollectif`), donc celle-ci vaut toujours la division arrondie. */
export function premiereMensualite(total: number): number {
  return Math.round(total / MOIS_CYCLE_COLLECTIF)
}

/* Ce que la fenêtre des frais d'inscription rend à son appelant. Posé ici, avec le calcul qui le
   remplit, plutôt que dans le composant : trois écrans et une route serveur le manipulent. */
export interface FraisInscription {
  /* Montant TOTAL dû pour le cycle, que le paiement soit intégral ou mensualisé : c'est
     l'engagement de l'élève, pas ce qu'il verse aujourd'hui. */
  montant: number
  /* Ce qui est réellement encaissé à l'inscription — la totalité, la première mensualité, ou
     rien. Évite à chaque appelant de refaire le calcul et de se tromper de moitié. */
  montantRegle: number
  modalite: ModalitePaiementCollectif
  /* `true` si quelque chose est encaissé aujourd'hui (la totalité, ou la 1re mensualité). */
  regle: boolean
  moyenPaiement: string
  reference: string
  notes: string
}
