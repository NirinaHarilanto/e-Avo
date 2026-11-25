import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveAccent } from '../../../lib/accent'
import { TestPositionnement } from '../TestPositionnement'

/* Questionnaire absent : impasse blanche — relevé le 2026-11-25 en cherchant pourquoi « la
 * fenêtre s'est fermée soudainement » chez un prospect.
 *
 * Le bouton « Commencer le questionnaire » faisait passer à l'étape « quiz » sans vérifier qu'il
 * y avait des énoncés. Sans question, le questionnaire ne rend RIEN, le rappel des étapes est
 * masqué pendant le quiz, et la fin ne se déclenche jamais : le candidat se retrouvait devant une
 * zone entièrement vide, sans aucun moyen d'avancer ni de revenir — seul un rechargement de la
 * page en sortait.
 *
 * Le parcours individuel se gardait déjà de ce cas (ReserverAppel : « sans questionnaire
 * configuré, il reste l'envoi direct d'avant ») ; le collectif, non.
 *
 * On ARRÊTE le candidat plutôt que de l'envoyer directement choisir sa session : la correction se
 * fait sur les énoncés du serveur, donc partir sans réponse ferait enregistrer un 0 sur cinquante
 * et un niveau « Beginner » qu'il n'a pas mérité. */

const CRENEAUX = [
  { id: 'c1', debut: '2026-12-05T07:00:00.000Z', dureeMinutes: 20, vague: 'vague-decembre', langue: 'en', placesRestantes: 4 },
]
const QUESTIONS = [{ id: 'q1', ordre: 1, enonce: 'She ___ to school.', options: ['go', 'goes', 'going'] }]

const accent = deriveAccent('#6d3bd1')

function stubFetch(questions: typeof QUESTIONS) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ creneaux: CRENEAUX, questions })))),
  )
}

async function remplirCoordonnees() {
  await screen.findByText('Coordonnées')
  fireEvent.change(screen.getByLabelText(/prénom/i), { target: { value: 'Tiana' } })
  fireEvent.change(screen.getByLabelText(/^nom/i), { target: { value: 'Rakoto' } })
  fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'tiana@exemple.mg' } })
  fireEvent.click(screen.getByRole('checkbox'))
}

function afficher() {
  return render(
    <TestPositionnement etablissementSlug="hari-online-course" etablissementNom="Hari Online Club" accent={accent} />,
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('Test de positionnement — questionnaire introuvable', () => {
  it('n’ouvre pas un questionnaire vide et le dit au candidat', async () => {
    stubFetch([])
    afficher()
    await remplirCoordonnees()

    expect(screen.getByText(/n’a pas pu être chargé/i)).toBeTruthy()
    const commencer = screen.getByRole('button', { name: /commencer le questionnaire/i })
    expect(commencer.hasAttribute('disabled')).toBe(true)

    fireEvent.submit(commencer)
    // Toujours sur les coordonnées : ni zone vide, ni étape « quiz » sans question.
    expect(screen.getByText('Coordonnées')).toBeTruthy()
    expect(screen.queryByText(/Question 1/)).toBeNull()
  })

  it('démarre normalement dès qu’il y a des énoncés', async () => {
    stubFetch(QUESTIONS)
    afficher()
    await remplirCoordonnees()

    expect(screen.queryByText(/n’a pas pu être chargé/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /commencer le questionnaire/i }))
    await screen.findByText(/Question 1/)
  })
})
