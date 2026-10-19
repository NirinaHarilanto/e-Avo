import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SupprimerProspect } from '../SupprimerProspect'

/* Le 2026-10-19, supprimer un candidat collectif ayant réglé ses frais était une impasse : le
   refus de l'API renvoyait vers une section Paiements où la ligne était invisible avant
   conversion, et l'admin tournait en rond sans jamais savoir de quel montant il s'agissait.
   Décision client : « tout emporter, après confirmation du montant ».

   Ces tests verrouillent l'enchaînement vu par l'admin, pas seulement la route : le premier refus
   ne doit JAMAIS s'afficher comme une erreur, il doit devenir un deuxième écran qui chiffre ce qui
   va disparaître, et seul le clic sur ce deuxième écran envoie la confirmation. */

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { access_token: 'jeton-test' } }),
}))

const appels: { corps: Record<string, unknown> }[] = []
let reponses: { status: number; corps: Record<string, unknown> }[] = []

beforeEach(() => {
  appels.length = 0
  reponses = []
  vi.stubGlobal('fetch', async (_url: string, options: { body: string }) => {
    appels.push({ corps: JSON.parse(options.body) })
    const reponse = reponses.shift() ?? { status: 200, corps: { ok: true } }
    return { ok: reponse.status < 400, status: reponse.status, json: async () => reponse.corps }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ludivic = { id: 'prospect-1', prenom: 'Ludivic', nom: 'bensas' } as const

/* Le bouton déclencheur et le bouton de confirmation portent tous deux le nom « Supprimer » :
   le second est monté après, dans la pop-up, donc c'est le dernier du DOM. */
function ouvrirLaPopUp() {
  fireEvent.click(screen.getAllByRole('button', { name: /Supprimer/ })[0])
}
function confirmerPremierEcran() {
  const boutons = screen.getAllByRole('button', { name: 'Supprimer' })
  fireEvent.click(boutons[boutons.length - 1])
}

describe('SupprimerProspect', () => {
  it('supprime directement un candidat sans encaissement', async () => {
    const onSupprime = vi.fn()
    render(<SupprimerProspect prospects={[ludivic]} onSupprime={onSupprime} />)

    ouvrirLaPopUp()
    confirmerPremierEcran()

    await waitFor(() => expect(onSupprime).toHaveBeenCalledTimes(1))
    expect(appels).toHaveLength(1)
    expect(appels[0].corps.confirmerSuppressionFinanciere).toBe(false)
  })

  it('chiffre l’encaissement au lieu d’afficher un refus, puis l’efface sur confirmation', async () => {
    reponses = [
      {
        status: 409,
        corps: {
          error: 'Ce candidat a un encaissement actif : confirmez pour l’effacer avec son dossier.',
          lignesFinancieres: [
            { id: 'paiement-1', montant: 150000, montantRegle: 150000, devise: 'Ar', libelle: 'Frais d’inscription' },
          ],
        },
      },
      { status: 200, corps: { ok: true } },
    ]
    const onSupprime = vi.fn()
    render(<SupprimerProspect prospects={[ludivic]} onSupprime={onSupprime} />)

    ouvrirLaPopUp()
    confirmerPremierEcran()

    // Le montant est affiché, pas le message d'erreur brut : c'est tout l'objet de ce deuxième écran.
    const confirmer = await screen.findByRole('button', { name: /Effacer le dossier et l’encaissement/ })
    expect(screen.getByText(/150 000,00 Ar/)).toBeTruthy()
    expect(screen.getByText(/Frais d’inscription/)).toBeTruthy()
    expect(onSupprime).not.toHaveBeenCalled()

    fireEvent.click(confirmer)

    await waitFor(() => expect(onSupprime).toHaveBeenCalledTimes(1))
    expect(appels).toHaveLength(2)
    expect(appels[0].corps.confirmerSuppressionFinanciere).toBe(false)
    expect(appels[1].corps.confirmerSuppressionFinanciere).toBe(true)
  })

  it('affiche comme une erreur un refus qui ne porte aucun encaissement', async () => {
    reponses = [{ status: 409, corps: { error: 'Ce prospect est déjà rattaché au dossier financier d’un élève.' } }]
    const onSupprime = vi.fn()
    render(<SupprimerProspect prospects={[ludivic]} onSupprime={onSupprime} />)

    ouvrirLaPopUp()
    confirmerPremierEcran()

    expect(await screen.findByText(/dossier financier/)).toBeTruthy()
    expect(onSupprime).not.toHaveBeenCalled()
  })

  it('annule sans rien envoyer de plus depuis le deuxième écran', async () => {
    reponses = [
      {
        status: 409,
        corps: {
          error: 'Ce candidat a un encaissement actif : confirmez pour l’effacer avec son dossier.',
          lignesFinancieres: [{ id: 'paiement-1', montant: 150000, montantRegle: 0, devise: 'Ar', libelle: null }],
        },
      },
    ]
    const onSupprime = vi.fn()
    render(<SupprimerProspect prospects={[ludivic]} onSupprime={onSupprime} />)

    ouvrirLaPopUp()
    confirmerPremierEcran()
    await screen.findByRole('button', { name: /Effacer le dossier et l’encaissement/ })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(appels).toHaveLength(1)
    expect(onSupprime).not.toHaveBeenCalled()
  })
})
