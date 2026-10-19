/* Prestations externes : cours corporate et chat & chill (0131, demande client du 2026-10-19).
   Données hors cursus HOC — ni élève inscrit, ni forfait, ni compteur d'heures côté étudiant —
   elles créditent les heures du professeur et se facturent sur son TimeSheet.

   Volontairement pur (aucune requête, aucune horloge) comme heures.ts ou remuneration.ts : les
   deux règles qui décident de ce qu'on peut faire d'une prestation y sont vérifiables par des
   tests. */

import type { StatutPrestationExterne, TypePrestationExterne } from '../types/database.types.js'

export const LIBELLE_TYPE_PRESTATION: Record<TypePrestationExterne, string> = {
  corporate: 'Corporate',
  chat_chill: 'Chat & chill',
}

export const LIBELLE_STATUT_PRESTATION: Record<StatutPrestationExterne, string> = {
  planifiee: 'Planifiée',
  terminee: 'Terminée',
  annulee: 'Annulée',
}

/* Le taux horaire de la fiche professeur qui s'applique à chaque type. Un seul endroit où le lien
   est écrit : il sert à l'estimation affichée comme au calcul réel (voir remuneration.ts). */
export const COLONNE_TAUX_PRESTATION: Record<TypePrestationExterne, 'taux_horaire_corporate' | 'taux_horaire_chat_chill'> = {
  corporate: 'taux_horaire_corporate',
  chat_chill: 'taux_horaire_chat_chill',
}

/* Une prestation ne se clôture qu'une fois commencée : marquer « terminé » un cours qui n'a pas
   encore eu lieu créditerait des heures jamais données, et ces heures partent ensuite en
   facturation sur le TimeSheet. L'instant de référence est un paramètre, jamais lu ici. */
export function peutEtreCloturee(
  prestation: { statut: StatutPrestationExterne; debut: string },
  maintenant: Date,
): boolean {
  if (prestation.statut !== 'planifiee') return false
  const debut = new Date(prestation.debut)
  if (Number.isNaN(debut.getTime())) return false
  return debut.getTime() <= maintenant.getTime()
}

/* Une prestation terminée ne se modifie plus : son crédit d'heures est écrit, et il part en
   facturation. Corriger sa durée après coup désaccorderait le registre et le relevé — même
   principe qu'un forfait payé, qui ne se réécrit jamais (0057). */
export function peutEtreModifiee(prestation: { statut: StatutPrestationExterne }): boolean {
  return prestation.statut === 'planifiee'
}

/* Montant estimé d'une prestation, à titre indicatif sur la fiche : le montant qui fait foi est
   recalculé au moment de la validation du TimeSheet, avec le taux en vigueur à ce moment-là
   (même règle que pour les séances, voir api/admin/traiter-timesheet.ts). `null` quand le taux
   n'est pas renseigné — on n'affiche alors pas « 0 Ar », qui serait un montant faux. */
export function montantEstime(dureeMinutes: number, taux: number | null | undefined): number | null {
  if (taux == null) return null
  return Math.round((dureeMinutes / 60) * taux * 100) / 100
}

export function heuresDepuisMinutes(dureeMinutes: number): number {
  return Math.round((dureeMinutes / 60) * 100) / 100
}
