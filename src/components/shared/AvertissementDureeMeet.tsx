import { MessageInfo } from '../ui/Etats'

/* Limite réelle de Google Meet sur un compte Gmail gratuit : une réunion à 3 participants ou
   plus est coupée au bout de 60 minutes. Un cours individuel (professeur + 1 élève = 2
   personnes) n'a aucune limite. Mieux vaut le dire au moment où la durée est saisie que laisser
   un cours collectif se couper en plein milieu. */
export function AvertissementDureeMeet({
  dureeMinutes,
  nombreEleves,
}: {
  dureeMinutes: number
  nombreEleves: number
}) {
  // +1 : le professeur compte comme participant.
  if (dureeMinutes <= 60 || nombreEleves + 1 < 3) return null

  return (
    <MessageInfo>
      Ce cours réunit {nombreEleves + 1} participants pendant {dureeMinutes} minutes. Si vos liens Meet proviennent d’un
      compte Gmail gratuit, la réunion sera coupée au bout de 60 minutes : prévoyez deux séances, ou un compte Google
      Workspace.
    </MessageInfo>
  )
}
