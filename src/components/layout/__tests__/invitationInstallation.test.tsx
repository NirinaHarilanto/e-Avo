import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

/* Demande client du 2026-11-23 : « le bouton installer doit s'afficher uniquement lorsque
 * l'utilisateur utilise UNIQUEMENT son téléphone pour se connecter à l'application HOC ET
 * lorsqu'il est dans son espace personnel. »
 *
 * La seconde condition tient au MONTAGE : ce composant n'est rendu que par EspaceLayout, le
 * tronc commun des trois espaces connectés, donc jamais sur la vitrine publique.
 *
 * La première se décide ici, et c'est elle que ces tests gardent — avec le refus, qui doit être
 * définitif : une proposition d'installation qui reparaît à chaque page cesse d'être une
 * proposition. */

const vraiMatchMedia = window.matchMedia

function simulerAppareil({ telephone, installee = false }: { telephone: boolean; installee?: boolean }) {
  Object.defineProperty(window, 'innerWidth', { value: telephone ? 390 : 1440, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: telephone ? 844 : 900, configurable: true })
  window.matchMedia = ((requete: string) =>
    ({
      matches:
        requete.includes('pointer: coarse') ? telephone
        : requete.includes('hover: none') ? telephone
        : requete.includes('display-mode: standalone') ? installee
        : false,
      media: requete,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

/** Rejoue l'annonce d'installabilité du navigateur, que seuls les moteurs Chromium émettent. */
function annoncerInstallabilite() {
  const evenement = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string }>
  }
  evenement.prompt = vi.fn(async () => {})
  evenement.userChoice = Promise.resolve({ outcome: 'accepted' })
  window.dispatchEvent(evenement)
  return evenement
}

const banniere = () => document.querySelector('.invitation-installation')

/* Le module retient l'annonce du navigateur dans une variable qui lui est propre : c'est voulu,
   l'événement arrive souvent avant que React n'ait fini de monter. Mais cet état survivrait d'un
   test au suivant et les rendrait dépendants de leur ordre — on repart donc d'un module neuf à
   chaque fois. */
async function monter() {
  vi.resetModules()
  const { InvitationInstallation } = await import('../InvitationInstallation')
  return render(<InvitationInstallation />)
}

beforeEach(() => {
  localStorage.clear()
  /* `navigator.serviceWorker` n'existe pas en jsdom : l'enregistrement est inerte ici, et c'est
     très bien — ce composant ne s'en occupe plus (il se fait au démarrage, main.tsx). */
})

afterEach(() => {
  window.matchMedia = vraiMatchMedia
  localStorage.clear()
})

describe('invitation à installer l’application', () => {
  it('se propose sur un téléphone, une fois le navigateur prêt', async () => {
    simulerAppareil({ telephone: true })
    await monter()
    annoncerInstallabilite()

    await waitFor(() => expect(banniere()).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Installer' })).toBeTruthy()
  })

  /* Le cœur de la demande : rien sur un ordinateur, même quand le navigateur se dit prêt. */
  it('ne se propose jamais sur un ordinateur', async () => {
    simulerAppareil({ telephone: false })
    await monter()
    annoncerInstallabilite()

    await new Promise((r) => setTimeout(r, 50))
    expect(banniere()).toBeNull()
  })

  it('ne se propose pas tant que le navigateur n’a rien annoncé', async () => {
    simulerAppareil({ telephone: true })
    await monter()

    expect(banniere()).toBeNull()
  })

  /* Déjà installée : reproposer l'installation DANS l'application installée serait absurde. */
  it('ne se propose pas quand l’application tourne déjà installée', async () => {
    simulerAppareil({ telephone: true, installee: true })
    await monter()
    annoncerInstallabilite()

    await new Promise((r) => setTimeout(r, 50))
    expect(banniere()).toBeNull()
  })

  it('déclenche la fenêtre d’installation du navigateur au clic', async () => {
    simulerAppareil({ telephone: true })
    await monter()
    const evenement = annoncerInstallabilite()
    await waitFor(() => expect(banniere()).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Installer' }))

    await waitFor(() => expect(evenement.prompt).toHaveBeenCalled())
  })

  /* Un refus est définitif, et il survit au rechargement : c'est ce qui distingue une
     proposition d'un harcèlement. */
  it('ne reparaît plus une fois écartée, même après rechargement', async () => {
    simulerAppareil({ telephone: true })
    const { unmount } = await monter()
    annoncerInstallabilite()
    await waitFor(() => expect(banniere()).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Ne plus proposer/ }))
    expect(banniere()).toBeNull()

    unmount()
    await monter()
    annoncerInstallabilite()
    await new Promise((r) => setTimeout(r, 50))
    expect(banniere()).toBeNull()
  })
})
