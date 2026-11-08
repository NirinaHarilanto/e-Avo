import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { estErreurDeChargementDeModule, tenterRechargementApresMiseEnLigne } from '../rechargementVersion'

/* Incident du 2026-11-08, capture à l'appui : « le pop-up ne veut pas partir, et ni recharger la
   page ». Ce n'était pas un pop-up mais le filet de sécurité du rendu, et le journal des erreurs
   (0121) a nommé la cause en douze lignes identiques — « Failed to fetch dynamically imported
   module: .../assets/PipelineCRM-BetcFFlC.js » sur /admin/prospects, pendant une mise en ligne.

   Deux garanties à tenir, et elles tirent en sens inverse : reprendre tout seul (sinon chaque
   déploiement bloque quiconque a un onglet ouvert) SANS jamais boucler (sinon la page clignote
   et personne ne lit le message). D'où le plafond d'une tentative par minute, que ce fichier
   verrouille des deux côtés. */

let rechargements = 0
const locationOrigine = window.location

beforeEach(() => {
  rechargements = 0
  sessionStorage.clear()
  /* `reload` n'est pas redéfinissable sous jsdom : on remplace l'objet `location` entier, et on
     le remet ensuite pour ne pas contaminer les fichiers de test voisins. */
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...locationOrigine, reload: () => { rechargements += 1 } },
  })
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: locationOrigine })
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('estErreurDeChargementDeModule', () => {
  /* Un message par moteur : les trois navigateurs nomment la même panne différemment, et n'en
     reconnaître qu'un laisserait les deux autres sur l'écran d'erreur. */
  it('reconnaît le message de chaque navigateur', () => {
    const messages = [
      'Failed to fetch dynamically imported module: https://x/assets/PipelineCRM-BetcFFlC.js',
      'error loading dynamically imported module: https://x/assets/a.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/a.css',
      'Failed to load module script: MIME type text/html',
    ]
    for (const message of messages) {
      expect(estErreurDeChargementDeModule(new Error(message))).toBe(true)
    }
  })

  it('ne confond pas une vraie erreur de rendu avec une mise en ligne', () => {
    expect(estErreurDeChargementDeModule(new Error("Cannot read properties of null (reading 'nom')"))).toBe(false)
    expect(estErreurDeChargementDeModule(new Error('Failed to fetch'))).toBe(false)
    expect(estErreurDeChargementDeModule(null)).toBe(false)
    expect(estErreurDeChargementDeModule(undefined)).toBe(false)
  })

  it('tolère une casse différente', () => {
    expect(estErreurDeChargementDeModule(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE: /a.js'))).toBe(true)
  })

  it('accepte autre chose qu’une Error', () => {
    expect(estErreurDeChargementDeModule('Failed to fetch dynamically imported module: /a.js')).toBe(true)
  })
})

describe('tenterRechargementApresMiseEnLigne', () => {
  it('recharge la page à la première demande', () => {
    expect(tenterRechargementApresMiseEnLigne()).toBe(true)
    expect(rechargements).toBe(1)
  })

  /* Le garde-fou : si le rechargement ne suffit pas (fichier réellement manquant, réseau coupé,
     cache intermédiaire), la seconde tentative échouerait pareil et la page clignoterait sans
     que personne ne lise jamais le message. */
  it('refuse une seconde tentative dans la foulée', () => {
    expect(tenterRechargementApresMiseEnLigne()).toBe(true)
    expect(tenterRechargementApresMiseEnLigne()).toBe(false)
    expect(tenterRechargementApresMiseEnLigne()).toBe(false)
    expect(rechargements).toBe(1)
  })

  it('rouvre la reprise une minute plus tard', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-08T20:00:00Z'))
    expect(tenterRechargementApresMiseEnLigne()).toBe(true)

    vi.setSystemTime(new Date('2026-11-08T20:00:59Z'))
    expect(tenterRechargementApresMiseEnLigne()).toBe(false)

    vi.setSystemTime(new Date('2026-11-08T20:01:01Z'))
    expect(tenterRechargementApresMiseEnLigne()).toBe(true)
    expect(rechargements).toBe(2)
  })

  /* Sans mémoire d'une tentative précédente, recharger expose justement à la boucle que tout ce
     module cherche à éviter : on préfère rendre la main à l'utilisateur. */
  it('ne recharge pas quand le stockage de session est refusé', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage refusé')
    })

    expect(tenterRechargementApresMiseEnLigne()).toBe(false)
    expect(rechargements).toBe(0)
  })
})
