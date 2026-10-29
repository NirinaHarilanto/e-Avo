import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { deriveAccent } from '../../../lib/accent'

/* Hero « Cours & tarifs » et fenêtre des formules, d'après les demandes client du 2026-10-29.
   Ce que ces tests verrouillent, parce que rien d'autre ne le ferait :

   — la carte de rentrée n'écrit JAMAIS de date à elle : elle n'existe que si l'administration a
     programmé une vague, et affiche exactement la date reçue. Une date en dur dans le composant
     passerait inaperçue à l'œil, la carte étant identique dans les deux cas ;
   — « Passer le test de niveau » ouvre la formule collective directement sur l'onglet
     « Réserver » : sans cela, le bouton déposerait le visiteur sur une page de présentation ;
   — l'ordre des étapes du collectif, inversé à la demande du client (questionnaire écrit
     d'abord, réservation du test oral ensuite).

   Les deux modules de réservation sont remplacés par des doublures : ils interrogent la base, et
   ce n'est pas leur comportement qui est en jeu ici. */

vi.mock('../../prospects/ReserverAppel', () => ({
  ReserverAppel: () => <div>module de réservation d’appel</div>,
}))
vi.mock('../../prospects/TestPositionnement', () => ({
  TestPositionnement: () => <div>module de test de positionnement</div>,
}))

const { PageCours } = await import('../PageCours')

function afficher(prochaineVagueCourte: string | null) {
  return render(
    <PageCours
      tarifs={[]}
      prochaineVague={prochaineVagueCourte ? `${prochaineVagueCourte} 2026` : null}
      prochaineVagueCourte={prochaineVagueCourte}
      etablissementSlug="hari-online-course"
      etablissementNom="Hari Online Club"
      accent={deriveAccent('#6d3bd1')}
    />,
  )
}

describe('Hero « Cours & tarifs » — carte de la prochaine rentrée', () => {
  it('affiche la date venue de l’administration, telle quelle', () => {
    afficher('1er novembre')
    expect(screen.getByText('Rentrée le')).toBeTruthy()
    expect(screen.getByText('1er novembre')).toBeTruthy()
    expect(screen.getByRole('button', { name: /passer le test de niveau/i })).toBeTruthy()
  })

  it('ne montre aucune carte de rentrée tant qu’aucune vague n’est programmée', () => {
    afficher(null)
    expect(screen.queryByText('Rentrée le')).toBeNull()
    expect(screen.queryByRole('button', { name: /passer le test de niveau/i })).toBeNull()
  })

  it('affiche les quatre pastilles d’information de la maquette', () => {
    afficher('1er novembre')
    for (const libelle of [
      'Mvola, Orange Money ou virement',
      'Paiement en 2 fois possible',
      'Préparation TOEIC, TOEFL, IELTS',
      'Projet de migration',
    ]) {
      expect(screen.getByText(libelle)).toBeTruthy()
    }
  })
})

describe('Fenêtre des formules', () => {
  it('« Passer le test de niveau » ouvre le collectif sur l’onglet « Réserver »', () => {
    afficher('1er novembre')
    fireEvent.click(screen.getByRole('button', { name: /passer le test de niveau/i }))

    const dialogue = screen.getByRole('dialog', { name: 'Cours en petit groupe' })
    const ongletActif = dialogue.querySelector('.steps button[aria-current="step"]')
    expect(ongletActif?.textContent).toContain('Réserver')
    expect(screen.getByText('module de test de positionnement')).toBeTruthy()
  })

  it('ouvre une carte de formule sur « Découvrir », et non sur la réservation', () => {
    afficher('1er novembre')
    fireEvent.click(screen.getByRole('button', { name: /cours particuliers/i }))

    const dialogue = screen.getByRole('dialog', { name: 'Cours particuliers' })
    expect(dialogue.querySelector('.steps button[aria-current="step"]')?.textContent).toContain('Découvrir')
  })

  it('annonce le questionnaire écrit avant la réservation du test oral (collectif)', () => {
    afficher('1er novembre')
    fireEvent.click(screen.getByRole('button', { name: /cours en petit groupe/i }))

    const etapes = Array.from(
      screen.getByRole('dialog', { name: 'Cours en petit groupe' }).querySelectorAll('ol li'),
      (li) => li.textContent ?? '',
    )
    expect(etapes[0]).toContain('questionnaire écrit de positionnement')
    expect(etapes[1]).toContain('session de test oral')
  })
})
