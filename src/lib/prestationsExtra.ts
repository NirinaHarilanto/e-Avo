import type { Database } from '../types/database.types.js'

type PrestationExtra = Database['public']['Tables']['prestations_extra']['Row']
export type StatutExtra = PrestationExtra['statut']

/* Prestation « Extra » — demande client du 2026-11-17. Ce fichier porte ce qui se raisonne sans
   base : les trois statuts, lequel se paie, et les totaux. Les mêmes réponses servent à la
   tuile, au pop-up de l'admin, à celui du professeur et au relevé d'heures — les écrire une
   seule fois est ce qui garantit qu'ils ne diront jamais trois choses différentes. */

export const STATUTS_EXTRA: { valeur: StatutExtra; libelle: string }[] = [
  { valeur: 'planifiee', libelle: 'Planifiée' },
  { valeur: 'validee', libelle: 'Validée' },
  { valeur: 'annulee', libelle: 'Annulée' },
]

export const LIBELLE_STATUT_EXTRA: Record<StatutExtra, string> = {
  planifiee: 'Planifiée',
  validee: 'Validée',
  annulee: 'Annulée',
}

/* « Pour les prestations validées, le montant validé sera rajouté automatiquement dans le
   timesheet » : c'est le statut, et lui seul, qui ouvre le paiement. Une prestation planifiée est
   convenue mais pas encore reconnue comme due ; une annulée ne le sera jamais. */
export function estPayable(extra: Pick<PrestationExtra, 'statut'>): boolean {
  return extra.statut === 'validee'
}

/** Payé = rattaché à une rémunération, même convention que le grand livre (0029) et les bonus. */
export function estPaye(extra: Pick<PrestationExtra, 'teacher_payment_id'>): boolean {
  return extra.teacher_payment_id !== null
}

/* Trois totaux et non deux, contrairement aux bonus : une prestation peut être convenue sans
   être encore due. Les confondre afficherait comme « à payer » un montant que l'admin n'a pas
   encore reconnu. */
export function totauxExtra(
  extras: Pick<PrestationExtra, 'montant' | 'statut' | 'teacher_payment_id'>[],
): { planifie: number; aPayer: number; paye: number } {
  return extras.reduce(
    (totaux, extra) => {
      const montant = Number(extra.montant)
      if (extra.statut === 'annulee') return totaux
      if (estPaye(extra)) return { ...totaux, paye: totaux.paye + montant }
      if (estPayable(extra)) return { ...totaux, aPayer: totaux.aPayer + montant }
      return { ...totaux, planifie: totaux.planifie + montant }
    },
    { planifie: 0, aPayer: 0, paye: 0 },
  )
}

/** Intitulé d'une prestation sur le relevé et la facture : ce que le professeur relira. */
export function libelleExtra(
  extra: Pick<PrestationExtra, 'type_prestation' | 'date_prestation' | 'lieu'>,
): string {
  const quand = new Date(extra.date_prestation).toLocaleDateString('fr-FR')
  const ou = extra.lieu?.trim() ? ` · ${extra.lieu.trim()}` : ''
  return `${extra.type_prestation} (${quand})${ou}`
}

/* Durée en heures et minutes, comme partout ailleurs dans l'application — `null` quand aucune
   durée n'a été saisie, ce qui est permis : un forfait de relecture ou de conception n'a pas
   toujours de durée qui ait un sens. */
export function formaterDuree(dureeMinutes: number | null): string | null {
  if (dureeMinutes === null) return null
  const heures = Math.floor(dureeMinutes / 60)
  const minutes = dureeMinutes % 60
  if (heures === 0) return `${minutes}m`
  return minutes === 0 ? `${heures}h` : `${heures}h ${minutes}m`
}
