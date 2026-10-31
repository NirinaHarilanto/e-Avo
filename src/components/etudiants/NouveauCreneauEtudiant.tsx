import { useState } from 'react'
import { FormulaireCreerEvenement } from '../shared/FormulaireCreerEvenement'
import { boutonSecondaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

/* Prochain quart d'heure à venir. Passer par `toISOString()` reculerait la date d'un jour en début
   de soirée à Madagascar (UTC+3), comme partout ailleurs dans HOC — on reste donc sur les
   accesseurs locaux. */
function prochainQuartDHeure(): Date {
  const date = new Date()
  date.setMinutes(Math.ceil((date.getMinutes() + 1) / 15) * 15, 0, 0)
  return date
}

/**
 * Planification d'une séance ou d'une réunion depuis la fiche d'un élève (demande client du
 * 2026-10-31), dans les onglets Forfait et Planning.
 *
 * Ouvre la MÊME fenêtre que l'agenda — « Créer un rendez-vous »
 * (shared/FormulaireCreerEvenement.tsx) — et non plus un petit formulaire à part comme dans la
 * première version du 2026-10-31. Le client l'a demandé explicitement, capture à l'appui : « un
 * pop-up similaire à la figure apparaîtra avec le nom de ou des professeurs et étudiants associés
 * qui s'afficheront par défaut. Ce pop-up permettra de planifier des séances de cours ou séance
 * d'information. »
 *
 * Deux conséquences voulues :
 * — l'admin retrouve ici tout ce que l'agenda lui offre (séance de cours OU rendez-vous « autre »
 *   pour une réunion ou une séance d'information, répétition, participants optionnels, notes),
 *   au lieu du seul couple date + durée ;
 * — le professeur et l'élève sont déjà dans la zone « Professeur et élèves » à l'ouverture : c'est
 *   tout ce que cet écran sait de plus que l'agenda, et le seul intérêt d'y avoir un bouton.
 *
 * Ils restent retirables et on peut en ajouter : un point de suivi peut réunir l'élève et deux
 * professeurs, ou l'élève seul avec l'administration.
 */
export function NouveauCreneauEtudiant({
  studentIds,
  teacherId,
  dureeParDefaut = 60,
  onCree,
}: {
  studentIds: string[]
  teacherId: string
  dureeParDefaut?: number
  onCree: () => void
}) {
  const [ouverte, setOuverte] = useState(false)
  /* Figé à l'ouverture : recalculer à chaque rendu remettrait le champ à l'heure courante pendant
     que l'admin le remplit. */
  const [debutInitial, setDebutInitial] = useState(prochainQuartDHeure)

  return (
    <>
      {/* Même style que les autres boutons de l'application (`boutonSecondaireStyle`) — signalé
          par le client le 2026-10-31 : « il faut qu'il ressemble en police, taille et couleur de
          fond aux autres boutons […] il faut que tout soit visuellement uniforme ». La première
          version posait `boutonPrimaireStyle` SANS la classe `btn-shine` qui lui donne sa police,
          son rembourrage et son arrondi (voir ui/Boutons.tsx) : le bouton sortait donc en or sur
          un gabarit de navigateur, différent de tout le reste. */}
      <button
        type="button"
        onClick={() => {
          setDebutInitial(prochainQuartDHeure())
          setOuverte(true)
        }}
        style={boutonSecondaireStyle}
      >
        <Icone nom="plus" taille={14} />
        Nouveau créneau
      </button>

      {ouverte && (
        <FormulaireCreerEvenement
          debutInitial={debutInitial}
          /* Le professeur d'abord : la fenêtre exige « exactement un professeur et au moins un
             élève » pour une séance de cours, et c'est dans cet ordre que l'admin les relit. */
          participantsInitiaux={[teacherId, ...studentIds]}
          natureInitiale="seance_cours"
          dureeInitiale={dureeParDefaut}
          onFermer={() => setOuverte(false)}
          onCree={() => {
            setOuverte(false)
            onCree()
          }}
        />
      )}
    </>
  )
}
