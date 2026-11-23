import { describe, expect, it, afterEach, vi } from 'vitest'
import { dejaInstallee, estIOS, estUnTelephone } from '../installationApp'

/* Demande client du 2026-11-23 : le bouton d'installation doit s'afficher « uniquement lorsque
 * l'utilisateur utilise UNIQUEMENT son téléphone ET lorsqu'il est dans son espace personnel ».
 *
 * L'espace personnel est garanti par le montage (seul EspaceLayout rend ce composant). C'est
 * donc la reconnaissance du TÉLÉPHONE que ces tests gardent — et elle est délicate : aucun
 * indice ne suffit seul. Un portable à écran tactile satisfait `pointer: coarse`, une fenêtre
 * réduite satisfait la largeur, un agent utilisateur se falsifie. On exige les trois ensemble,
 * et ces tests vérifient qu'aucun cas limite ne passe à travers. */

const vraiMatchMedia = window.matchMedia
const vraieLargeur = window.innerWidth
const vraieHauteur = window.innerHeight

function simuler({
  pointeurGrossier,
  survol,
  largeur,
  hauteur,
}: {
  pointeurGrossier: boolean
  survol: boolean
  largeur: number
  hauteur: number
}) {
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: hauteur, configurable: true })
  window.matchMedia = ((requete: string) =>
    ({
      matches:
        requete.includes('pointer: coarse') ? pointeurGrossier
        : requete.includes('hover: none') ? !survol
        : requete.includes('display-mode: standalone') ? false
        : false,
      media: requete,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = vraiMatchMedia
  Object.defineProperty(window, 'innerWidth', { value: vraieLargeur, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: vraieHauteur, configurable: true })
  vi.restoreAllMocks()
})

describe('reconnaître un téléphone', () => {
  it('reconnaît un téléphone tenu à la verticale', () => {
    simuler({ pointeurGrossier: true, survol: false, largeur: 390, hauteur: 844 })
    expect(estUnTelephone()).toBe(true)
  })

  /* Un téléphone couché reste un téléphone : c'est le côté le plus COURT qui compte, sans quoi
     l'offre disparaîtrait dès qu'on tourne l'appareil. */
  it('reconnaît le même téléphone tenu à l’horizontale', () => {
    simuler({ pointeurGrossier: true, survol: false, largeur: 844, hauteur: 390 })
    expect(estUnTelephone()).toBe(true)
  })

  it('écarte un ordinateur, même avec une fenêtre étroite', () => {
    simuler({ pointeurGrossier: false, survol: true, largeur: 420, hauteur: 700 })
    expect(estUnTelephone()).toBe(false)
  })

  /* Un portable à écran tactile a bien un pointeur grossier, mais garde une souris et un grand
     écran : il ne doit pas recevoir une offre pensée pour le téléphone. */
  it('écarte un ordinateur portable à écran tactile', () => {
    simuler({ pointeurGrossier: true, survol: true, largeur: 1512, hauteur: 982 })
    expect(estUnTelephone()).toBe(false)
  })

  it('écarte une tablette, trop large pour la demande', () => {
    simuler({ pointeurGrossier: true, survol: false, largeur: 1024, hauteur: 1366 })
    expect(estUnTelephone()).toBe(false)
  })
})

describe('application déjà installée', () => {
  it('se reconnaît au mode d’affichage autonome', () => {
    window.matchMedia = ((requete: string) =>
      ({ matches: requete.includes('display-mode: standalone'), media: requete }) as unknown as MediaQueryList) as typeof window.matchMedia
    expect(dejaInstallee()).toBe(true)
  })

  /* Safari sur iPhone ne connaît pas `display-mode` et expose ce drapeau à la place : sans lui,
     l'offre reparaîtrait DANS l'application déjà installée. */
  it('se reconnaît au drapeau de Safari sur iPhone', () => {
    simuler({ pointeurGrossier: true, survol: false, largeur: 390, hauteur: 844 })
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
    expect(dejaInstallee()).toBe(true)
    Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true })
  })

  it('rend faux dans un navigateur ordinaire', () => {
    simuler({ pointeurGrossier: false, survol: true, largeur: 1440, hauteur: 900 })
    expect(dejaInstallee()).toBe(false)
  })
})

/* Sur iOS, l'installation est un geste manuel : aucun navigateur n'y émet d'événement, et
   l'offre repose donc sur la seule reconnaissance de l'appareil. Une première version ne
   reconnaissait que Safari, ce qui privait silencieusement de l'offre quiconque navigue avec
   Chrome ou Firefox sur iPhone — l'absence d'un bouton ne se remarque pas. */
describe('reconnaître un appareil iOS', () => {
  function avecAgent(ua: string) {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua)
  }

  it('reconnaît Safari sur iPhone', () => {
    avecAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
    expect(estIOS()).toBe(true)
  })

  it('reconnaît aussi Chrome sur iPhone', () => {
    avecAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1')
    expect(estIOS()).toBe(true)
  })

  it('reconnaît Firefox sur iPhone', () => {
    avecAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/120.0 Mobile/15E148 Safari/604.1')
    expect(estIOS()).toBe(true)
  })

  it('ne confond pas Android avec iPhone', () => {
    avecAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')
    expect(estIOS()).toBe(false)
  })

  function avecPointsDeContact(n: number) {
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: n, configurable: true })
  }

  /* Un iPad récent annonce « Macintosh » comme un Mac de bureau : seul le tactile les sépare. */
  it('reconnaît un iPad, qui se présente comme un Mac', () => {
    avecAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15')
    avecPointsDeContact(5)
    expect(estIOS()).toBe(true)
    avecPointsDeContact(0)
  })

  it('ne confond pas un Mac de bureau avec un iPad', () => {
    avecAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15')
    avecPointsDeContact(0)
    expect(estIOS()).toBe(false)
  })
})
