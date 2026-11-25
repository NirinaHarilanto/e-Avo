import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { deriveAccent } from '../../../lib/accent'

/* Sortir du questionnaire — deux demandes successives du client, le 2026-11-25.
 *
 * D'abord l'incident : « un prospect a commencé le test et la fenêtre s'est fermée soudainement de
 * son côté ». La fenêtre se fermait sur une simple frappe d'Échap, à n'importe quel moment. Rien
 * n'étant conservé avant le tout dernier envoi, une frappe de trop effaçait les coordonnées et
 * jusqu'à cinquante réponses, sans un mot. C'est le même dégât que celui signalé le 2026-10-19
 * pour le clic extérieur, retiré alors, tandis que cette porte-ci restait ouverte.
 *
 * Puis la règle demandée ensuite : « si le prospect appuie sur fermer ou tente de sortir du test
 * en cours, il faudrait afficher un pop-up pour lui demander confirmation [...] lui indiquer
 * également qu'il perdra sa progression ». Toute sortie pendant le questionnaire passe donc par
 * une confirmation qui annonce la perte — la croix comme Échap.
 *
 * Ces tests gardent les deux moitiés : hors questionnaire, la sortie reste immédiate (il n'y a
 * rien à perdre) ; pendant, aucun geste ne peut effacer une progression sans un « oui » explicite.
 *
 * Le module de test de positionnement est remplacé par une doublure : il interroge la base, et ce
 * n'est pas son comportement qui est en jeu ici — seulement l'étape qu'il annonce à la fenêtre. */

vi.mock('../../prospects/ReserverAppel', () => ({
  ReserverAppel: () => <div>module de réservation d’appel</div>,
}))
vi.mock('../../prospects/TestPositionnement', () => ({
  TestPositionnement: ({ onEtapeChange }: { onEtapeChange?: (etape: string) => void }) => (
    <button type="button" onClick={() => onEtapeChange?.('quiz')}>
      commencer le questionnaire (doublure)
    </button>
  ),
}))

const { PageCours } = await import('../PageCours')

/* Ouvre la fenêtre du collectif directement sur l'onglet « Réserver », par le même bouton que le
   visiteur : c'est le chemin qu'emprunte un candidat venu passer le test. */
function ouvrirReservationCollectif() {
  render(
    <PageCours
      tarifs={[]}
      prochaineVague="1er décembre 2026"
      prochaineVagueCourte="1er décembre"
      etablissementSlug="hari-online-course"
      etablissementNom="Hari Online Club"
      accent={deriveAccent('#6d3bd1')}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /passer le test de niveau/i }))
  return screen.getByRole('dialog')
}

function commencerLeQuestionnaire() {
  fireEvent.click(screen.getByRole('button', { name: /commencer le questionnaire/i }))
}

function fenetreOuverte(): boolean {
  return screen.queryByRole('dialog') !== null
}

/* La confirmation est un `alertdialog`, la fenêtre du test un `dialog` : les deux se distinguent
   sans ambiguïté, y compris quand elles sont affichées en même temps. */
function confirmationAffichee(): boolean {
  return screen.queryByRole('alertdialog') !== null
}

describe('Fenêtre des formules — sortie hors questionnaire', () => {
  it('se ferme sur Échap tant que le questionnaire n’a pas commencé', () => {
    ouvrirReservationCollectif()
    expect(fenetreOuverte()).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(fenetreOuverte()).toBe(false)
  })

  it('se ferme sur la croix tant que le questionnaire n’a pas commencé', () => {
    ouvrirReservationCollectif()

    fireEvent.click(screen.getByRole('button', { name: /fermer/i }))
    expect(fenetreOuverte()).toBe(false)
    expect(confirmationAffichee()).toBe(false)
  })
})

describe('Fenêtre des formules — sortie pendant le questionnaire', () => {
  it('demande confirmation au lieu de fermer, quand on clique la croix', () => {
    ouvrirReservationCollectif()
    commencerLeQuestionnaire()

    fireEvent.click(screen.getByRole('button', { name: /fermer/i }))

    expect(confirmationAffichee()).toBe(true)
    expect(fenetreOuverte()).toBe(true)
  })

  it('demande confirmation au lieu de fermer, quand on appuie sur Échap', () => {
    ouvrirReservationCollectif()
    commencerLeQuestionnaire()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(confirmationAffichee()).toBe(true)
    expect(fenetreOuverte()).toBe(true)
  })

  it('annonce explicitement la perte de la progression', () => {
    ouvrirReservationCollectif()
    commencerLeQuestionnaire()
    fireEvent.click(screen.getByRole('button', { name: /fermer/i }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(/perdrez votre progression/i)
  })

  /* Le choix par défaut est de CONTINUER : revenir au test ne doit rien coûter. */
  it('revient au test, intact, quand on choisit de reprendre', () => {
    ouvrirReservationCollectif()
    commencerLeQuestionnaire()
    fireEvent.click(screen.getByRole('button', { name: /fermer/i }))

    fireEvent.click(screen.getByRole('button', { name: /reprendre le test/i }))

    expect(confirmationAffichee()).toBe(false)
    expect(fenetreOuverte()).toBe(true)
  })

  it('ferme tout quand on confirme vouloir quitter', () => {
    ouvrirReservationCollectif()
    commencerLeQuestionnaire()
    fireEvent.click(screen.getByRole('button', { name: /fermer/i }))

    fireEvent.click(screen.getByRole('button', { name: /quitter et perdre ma progression/i }))

    expect(fenetreOuverte()).toBe(false)
    expect(confirmationAffichee()).toBe(false)
  })

  /* Échap pendant la confirmation revient au test : une touche ne doit jamais, à elle seule,
     valider la perte d'une progression — ce serait recréer le défaut d'origine un cran plus loin. */
  it('ne valide jamais l’abandon sur une frappe d’Échap', () => {
    ouvrirReservationCollectif()
    commencerLeQuestionnaire()
    fireEvent.click(screen.getByRole('button', { name: /fermer/i }))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(fenetreOuverte()).toBe(true)
    expect(confirmationAffichee()).toBe(false)
  })

  /* Les volets restent montés quand on change d'onglet : le questionnaire ne se ferme pas, mais
     son chronomètre continue de tourner derrière. On revenait après quelques secondes en ayant
     perdu des questions sans l'avoir vu passer. */
  it('verrouille les onglets tant que le questionnaire est en cours', () => {
    ouvrirReservationCollectif()
    commencerLeQuestionnaire()

    expect(screen.getByRole('button', { name: /découvrir/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /tarifs/i })).toBeDisabled()
  })
})
