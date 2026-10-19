/* Les deux jalons du parcours d'un élève — demandes client 5 et 8 du 2026-10-19 :
   - « à la moitié de chaque forfait d'un étudiant, l'admin sera notifié qu'il devra faire un
     suivi pédagogique et lancer un meeting avec l'étudiant concerné » ;
   - « idem lorsque le forfait de l'étudiant est à 3 heures de la fin » ;
   - « il faut que l'étudiant renseigne l'enquête de satisfaction au milieu de son parcours (ou à
     la moitié de son forfait d'heures) et à 3 heures de fin de son parcours ».

   Deux demandes, deux mêmes instants : un jalon atteint déclenche à la fois la notification de
   suivi pédagogique de l'admin et l'enquête de satisfaction de l'élève.

   Fonction pure, sans requête ni horloge, comme heures.ts et quiz.ts : c'est elle qui décide
   qu'un élève doit être sollicité, elle doit être vérifiable par des tests. */

import type { JalonParcours } from '../types/database.types.js'

/* Les 3 heures de la demande, nommées plutôt que recopiées : le seuil de fin de parcours vit ici
   et nulle part ailleurs. Volontairement distinct de `seuil_alerte_heures_restantes`
   (`etablissements`, 0095, 5 h par défaut), qui déclenche l'e-mail de RENOUVELLEMENT envoyé à
   l'élève — ce sont deux rendez-vous différents, à deux moments différents, et les confondre
   ferait bouger l'un quand l'admin règle l'autre. */
export const HEURES_AVANT_FIN_PARCOURS = 3

/* Un jalon est atteint quand les heures consommées franchissent son seuil, sans condition de
   borne haute : une fois la moitié passée, le jalon de mi-parcours reste « atteint » même à
   100 % de consommation. C'est voulu — un élève qui passerait de 40 % à 90 % entre deux
   clôtures (séance de 4 h sur un forfait de 10) doit recevoir les DEUX jalons, pas seulement le
   dernier. L'unicité en base (`jalons_parcours_unique`) garantit qu'aucun ne se répète.

   Un forfait inconnu, nul ou trop court ne déclenche jamais rien : sur un forfait de 2 h, le
   seuil de « 3 heures avant la fin » serait négatif et le jalon tomberait dès la première heure,
   avant même la moitié du parcours. Même prudence que `forfaitEntierementConsomme`. */
export function jalonsAtteints(consommees: number, forfait: number | null): JalonParcours[] {
  if (forfait == null || forfait <= 0) return []

  const atteints: JalonParcours[] = []
  if (consommees >= forfait / 2) atteints.push('mi_parcours')
  /* Le seuil doit rester strictement au-delà de la moitié, sinon les deux jalons tomberaient
     ensemble et l'élève recevrait deux enquêtes le même jour pour un forfait court. */
  const seuilFin = forfait - HEURES_AVANT_FIN_PARCOURS
  if (seuilFin > forfait / 2 && consommees >= seuilFin) atteints.push('fin_parcours')
  return atteints
}

export const LIBELLE_JALON: Record<JalonParcours, string> = {
  mi_parcours: 'Mi-parcours',
  fin_parcours: 'Fin de parcours',
}

/* Phrase affichée à l'élève pour expliquer pourquoi on lui demande son avis maintenant. */
export const CONTEXTE_JALON: Record<JalonParcours, string> = {
  mi_parcours: 'Vous avez suivi la moitié de vos heures.',
  fin_parcours: `Il vous reste moins de ${HEURES_AVANT_FIN_PARCOURS} heures de cours.`,
}
