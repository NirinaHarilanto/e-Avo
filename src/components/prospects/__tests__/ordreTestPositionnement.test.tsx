import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveAccent } from '../../../lib/accent'
import { TestPositionnement } from '../TestPositionnement'

/* Ordre des étapes du test de positionnement, inversé le 2026-10-29 à la demande du client :
   coordonnées, questionnaire écrit, puis session de test oral. C'est l'ordre que la page
   publique annonce désormais dans « Comment ça se déroule » ; les deux doivent rester d'accord,
   et rien d'autre ne le garantirait.

   Le point le plus important ici : l'inscription ne part qu'au dernier geste. Tant que la
   session n'est pas choisie et validée, aucune place n'est retenue — un envoi déclenché à la fin
   du questionnaire, comme avant, réserverait sur un créneau que le candidat n'a pas choisi. */

const CRENEAUX = [
  { id: 'c1', debut: '2026-11-05T07:00:00.000Z', dureeMinutes: 20, vague: 'vague-novembre', langue: 'en', placesRestantes: 4 },
]
const QUESTIONS = [{ id: 'q1', ordre: 1, enonce: 'She ___ to school.', options: ['go', 'goes', 'going'] }]

const accent = deriveAccent('#6d3bd1')

function appelsA(chemin: string) {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((appel) => String(appel[0]).includes(chemin))
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (String(url).includes('inscrire-test')) {
        return Promise.resolve(
          new Response(JSON.stringify({ score: 1, total: 1, niveau: 'B1', quand: 'le 5 novembre', vague: 'vague-novembre' })),
        )
      }
      return Promise.resolve(new Response(JSON.stringify({ creneaux: CRENEAUX, questions: QUESTIONS })))
    }),
  )
})

function afficher() {
  return render(
    <TestPositionnement etablissementSlug="hari-online-course" etablissementNom="Hari Online Club" accent={accent} />,
  )
}

describe('Test de positionnement — ordre du parcours', () => {
  it('ouvre sur les coordonnées, pas sur le choix de la session', async () => {
    afficher()
    await screen.findByText('Coordonnées')

    const etapes = Array.from(document.querySelectorAll('div > span'), (s) => s.textContent).filter(
      (t) => t === 'Coordonnées' || t === 'Questionnaire' || t === 'Session',
    )
    expect(etapes).toEqual(['Coordonnées', 'Questionnaire', 'Session'])
    expect(screen.getByRole('button', { name: /commencer le questionnaire/i })).toBeTruthy()
    // Aucune session proposée à ce stade : elles ne viennent qu'après le questionnaire.
    expect(screen.queryByText(/Dernière étape/)).toBeNull()
  })

  it('prévient dès le premier écran que la place n’est retenue qu’à la fin', async () => {
    afficher()
    await screen.findByText('Coordonnées')
    expect(screen.getByText(/votre place n’est réservée qu’à la toute fin/i)).toBeTruthy()
  })

  it('n’inscrit personne tant que la session n’est pas choisie puis validée', async () => {
    afficher()
    await screen.findByText('Coordonnées')

    fireEvent.change(screen.getByLabelText(/prénom/i), { target: { value: 'Tiana' } })
    fireEvent.change(screen.getByLabelText(/^nom/i), { target: { value: 'Rakoto' } })
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'tiana@exemple.mg' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /commencer le questionnaire/i }))

    // Questionnaire : la dernière question mène à la session, elle n'envoie rien.
    await screen.findByText(/Question 1/)
    fireEvent.click(screen.getByRole('radio', { name: 'goes' }))
    const versSession = screen.getByRole('button', { name: /choisir ma session de test oral/i })
    fireEvent.click(versSession)

    await screen.findByText(/Dernière étape/)
    expect(appelsA('inscrire-test')).toHaveLength(0)

    // Le bouton reste inerte tant qu'aucune session n'est retenue.
    const valider = screen.getByRole('button', { name: /choisissez une session/i })
    expect(valider.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /vague-novembre/ }))
    fireEvent.click(screen.getByRole('button', { name: /valider ma réservation/i }))

    await waitFor(() => expect(appelsA('inscrire-test')).toHaveLength(1))
    const corps = JSON.parse(String(appelsA('inscrire-test')[0][1]?.body))
    expect(corps.creneauId).toBe('c1')
    expect(corps.reponses).toHaveLength(1)
    await screen.findByText('Votre place est réservée')
  })
})
