import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/* Incident du 2026-11-08, capture à l'appui : « le pop-up ne veut pas partir, et ni recharger la
   page ». Ce n'était pas un pop-up mais ce filet de sécurité, et ce qu'il affichait ne servait à
   rien dans ce cas précis — une mise en ligne venait d'avoir lieu, l'onglet réclamait encore un
   fichier de la version précédente (voir lib/rechargementVersion.ts).

   Deux pannes très différentes derrière le même écran, donc deux comportements à garder
   distincts : un écran qui plante vraiment (message générique, signalement à l'administration)
   et un onglet en retard d'une version (reprise automatique, message qui dit quoi faire). */

const signalerErreur = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../../lib/journalErreurs', () => ({
  signalerErreur: (...args: unknown[]) => signalerErreur(...args),
}))

const { FrontiereErreur } = await import('../FrontiereErreur')

let rechargements = 0
const locationOrigine = window.location

function Casse({ message }: { message: string }): never {
  throw new Error(message)
}

beforeEach(() => {
  rechargements = 0
  signalerErreur.mockClear()
  sessionStorage.clear()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...locationOrigine, reload: () => { rechargements += 1 } },
  })
  // React journalise lui-même l'erreur captée : attendu ici, et bruyant dans la sortie des tests.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: locationOrigine })
  vi.restoreAllMocks()
})

describe('FrontiereErreur — écran planté pour de bon', () => {
  it('affiche le message générique et ne recharge rien', () => {
    render(
      <FrontiereErreur>
        <Casse message="Cannot read properties of null (reading 'nom')" />
      </FrontiereErreur>,
    )

    expect(screen.getByText('Cet écran n’a pas pu s’afficher')).toBeTruthy()
    expect(screen.getByText(/enregistré automatiquement/)).toBeTruthy()
    expect(rechargements).toBe(0)
  })

  it('signale l’erreur à l’administration', () => {
    render(
      <FrontiereErreur>
        <Casse message="Cannot read properties of null" />
      </FrontiereErreur>,
    )

    expect(signalerErreur).toHaveBeenCalledWith('rendu', expect.any(Error), expect.anything())
  })
})

describe('FrontiereErreur — onglet en retard d’une version', () => {
  const MESSAGE = 'Failed to fetch dynamically imported module: https://x/assets/PipelineCRM-BetcFFlC.js'

  it('recharge la page tout seul', () => {
    render(
      <FrontiereErreur>
        <Casse message={MESSAGE} />
      </FrontiereErreur>,
    )

    expect(rechargements).toBe(1)
  })

  it('dit ce qui se passe plutôt que d’accuser l’écran', () => {
    render(
      <FrontiereErreur>
        <Casse message={MESSAGE} />
      </FrontiereErreur>,
    )

    expect(screen.getByText('Une nouvelle version vient d’être mise en ligne')).toBeTruthy()
    expect(screen.getByText(/vos données ne sont pas affectées/i)).toBeTruthy()
    // Et la sortie de secours quand recharger ne suffit pas — c'est exactement ce qui est arrivé.
    expect(screen.getByText(/fermez l’onglet et rouvrez l’application/)).toBeTruthy()
  })

  /* Le garde-fou qui empêche la page de clignoter : une seconde panne identique dans la minute
     ne relance pas de rechargement, elle laisse le message lisible. */
  it('ne recharge pas en boucle', () => {
    const { unmount } = render(
      <FrontiereErreur>
        <Casse message={MESSAGE} />
      </FrontiereErreur>,
    )
    unmount()
    render(
      <FrontiereErreur>
        <Casse message={MESSAGE} />
      </FrontiereErreur>,
    )

    expect(rechargements).toBe(1)
    expect(screen.getByText('Une nouvelle version vient d’être mise en ligne')).toBeTruthy()
  })

  it('signale quand même l’erreur à l’administration', () => {
    render(
      <FrontiereErreur>
        <Casse message={MESSAGE} />
      </FrontiereErreur>,
    )

    expect(signalerErreur).toHaveBeenCalled()
  })
})
