import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { deriveAccent } from '../../../lib/accent'

/* Échap pendant le questionnaire — incident signalé par le client le 2026-11-25 : « un prospect a
   commencé le test et la fenêtre s'est fermée soudainement de son côté ».
 *
 * La fenêtre des formules se fermait sur une simple frappe d'Échap, à n'importe quel moment. Rien
 * n'étant conservé avant le tout dernier envoi, une frappe de trop effaçait les coordonnées et
 * jusqu'à cinquante réponses déjà données, sans confirmation ni retour possible.
 *
 * C'est le même dégât que celui signalé le 2026-10-19 pour le clic extérieur — retiré alors,
 * tandis que cette porte-ci restait ouverte. Ces tests gardent les deux moitiés de la règle : la
 * sortie normale continue de fonctionner partout ailleurs, le questionnaire ne s'efface plus par
 * accident, et la croix reste le geste de sortie délibéré même en plein test.
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

function fenetreOuverte(): boolean {
  return screen.queryByRole('dialog') !== null
}

describe('Fenêtre des formules — Échap et questionnaire en cours', () => {
  it('se ferme sur Échap tant que le questionnaire n’a pas commencé', () => {
    ouvrirReservationCollectif()
    expect(fenetreOuverte()).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(fenetreOuverte()).toBe(false)
  })

  it('ne se ferme PAS sur Échap pendant le questionnaire', () => {
    ouvrirReservationCollectif()
    fireEvent.click(screen.getByRole('button', { name: /commencer le questionnaire/i }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(fenetreOuverte()).toBe(true)
  })

  it('laisse la croix fermer la fenêtre, même en plein questionnaire', () => {
    ouvrirReservationCollectif()
    fireEvent.click(screen.getByRole('button', { name: /commencer le questionnaire/i }))

    fireEvent.click(screen.getByRole('button', { name: /fermer/i }))
    expect(fenetreOuverte()).toBe(false)
  })
})
