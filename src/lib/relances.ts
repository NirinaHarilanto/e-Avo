/* Règles de relance, isolées du rendu pour être vérifiables par des tests (comme heures.ts ou
   quiz.ts) : aucune requête, aucune horloge implicite — l'instant de référence est toujours un
   paramètre. */

import type { ProspectStatut } from '../types/database.types'

/* Marge après l'heure du rendez-vous avant de considérer que le prospect ne s'est pas présenté.
   L'appel dure une trentaine de minutes : proposer la relance à l'heure pile ferait apparaître le
   bouton pendant que l'admin est encore en ligne avec le candidat. */
const MINUTES_APRES_RENDEZ_VOUS = 45

/**
 * Le prospect ne s'est, selon toute vraisemblance, pas présenté à son appel diagnostic — demande
 * client du 2026-10-19 (point 4) : « si le prospect n'est pas présent lors du diagnostic call, on
 * doit pouvoir le relancer via un bouton ».
 *
 * Déduit plutôt que saisi : l'application n'a pas de case « absent » sur un rendez-vous (les
 * statuts de `rendez_vous` sont en_attente/confirme/refuse/annule, 0042), et en ajouter une
 * demanderait à l'admin un geste de plus pour une information que l'état du dossier donne déjà.
 * Un rendez-vous dont l'heure est passée alors que le diagnostic n'a toujours pas été marqué
 * comme fait, c'est exactement le cas à relancer — que le candidat ait été absent ou que l'admin
 * ait oublié de clore la fiche, le rappel est pertinent dans les deux cas.
 *
 * Ne dit jamais oui sans rendez-vous connu : un prospect « diagnostic planifié » sans date (saisi
 * à la main par l'admin) n'a pas de rendez-vous manqué à relancer.
 */
export function diagnosticProbablementManque(
  prospect: { statut: ProspectStatut; debutRendezVous: string | null | undefined },
  maintenant: Date,
): boolean {
  if (prospect.statut !== 'diagnostic_planifie' || !prospect.debutRendezVous) return false
  const debut = new Date(prospect.debutRendezVous)
  if (Number.isNaN(debut.getTime())) return false
  return maintenant.getTime() > debut.getTime() + MINUTES_APRES_RENDEZ_VOUS * 60_000
}
