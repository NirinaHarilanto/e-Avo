import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creerEvenementVisio } from '../google.js'

/* Incident du 2026-10-31, signalé par le client capture à l'appui : un appel diagnostic s'affichait
   dans l'agenda Google avec DEUX liens de connexion, un Meet et un Jitsi, et l'application, elle,
   n'en montrait aucun.

   Cause : l'événement était créé en trois requêtes — création avec une salle Jitsi, ajout du Meet,
   puis remplacement du Jitsi par le Meet. Chacune notifiant les invités, Google refusait la
   troisième (« Rate Limit Exceeded ») ; le Jitsi restait donc affiché à côté du Meet, et
   l'exception faisait perdre à l'appelant l'identifiant d'un événement pourtant bien créé.

   Ces tests fixent la règle qui l'empêche : UNE seule requête par création, et aucune salle Jitsi
   posée sur un événement Meet. */

const integration = { accessToken: 'jeton-test', googleEmail: 'admin@harionlineclub.com' }

const params = {
  titre: 'Appel diagnostic — Stephane Rakoto',
  debut: '2026-11-02T06:00:00.000Z',
  dureeMinutes: 15,
  emailsInvites: ['irinastefanefr@gmail.com'],
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('creerEvenementVisio — fournisseur google_meet', () => {
  it('crée l’événement et sa visioconférence en UNE seule requête, sans salle Jitsi', async () => {
    const appels = vi.fn(async () => Response.json({ id: 'evt-1', hangoutLink: 'https://meet.google.com/tkz-crao-zhi' }))
    vi.stubGlobal('fetch', appels)

    const resultat = await creerEvenementVisio(integration, { ...params, fournisseur: 'google_meet' })

    expect(appels).toHaveBeenCalledTimes(1)
    expect(resultat).toEqual({
      eventId: 'evt-1',
      lienVisio: 'https://meet.google.com/tkz-crao-zhi',
      fournisseur: 'google_meet',
    })

    const [url, options] = appels.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toContain('conferenceDataVersion=1')
    const envoi = JSON.parse(options.body)
    expect(envoi.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet')
    /* Le cœur de la régression : rien ne doit porter de salle Jitsi sur un événement Meet. */
    expect(JSON.stringify(envoi)).not.toContain('meet.ffmuc.net')
    expect(envoi.location).toBeUndefined()
  })

  it('accepte le lien rendu par `conferenceData` quand `hangoutLink` est absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          id: 'evt-2',
          conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }] },
        }),
      ),
    )

    const resultat = await creerEvenementVisio(integration, { ...params, fournisseur: 'google_meet' })
    expect(resultat.lienVisio).toBe('https://meet.google.com/abc-defg-hij')
    expect(resultat.fournisseur).toBe('google_meet')
  })

  it('remonte l’erreur de Google quand l’événement n’a pas pu être créé', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'Rate Limit Exceeded' } }, { status: 403 })))

    await expect(creerEvenementVisio(integration, { ...params, fournisseur: 'google_meet' })).rejects.toThrow('Rate Limit Exceeded')
  })

  it('pose une salle de secours si Google crée l’événement sans sa visioconférence', async () => {
    const appels = vi.fn(async () => Response.json({ id: 'evt-3' }))
    vi.stubGlobal('fetch', appels)

    const resultat = await creerEvenementVisio(integration, { ...params, fournisseur: 'google_meet' })

    expect(resultat.eventId).toBe('evt-3')
    expect(resultat.fournisseur).toBe('jitsi')
    expect(resultat.lienVisio).toContain('http')
    // Création, puis la seule requête supplémentaire de ce chemin d'échec.
    expect(appels).toHaveBeenCalledTimes(2)
  })
})

describe('creerEvenementVisio — fournisseur jitsi (cours collectifs)', () => {
  it('garde la salle Jitsi dans le lieu de l’événement, en une requête', async () => {
    const appels = vi.fn(async () => Response.json({ id: 'evt-4' }))
    vi.stubGlobal('fetch', appels)

    const resultat = await creerEvenementVisio(integration, { ...params, emailsInvites: [], fournisseur: 'jitsi' })

    expect(appels).toHaveBeenCalledTimes(1)
    expect(resultat.fournisseur).toBe('jitsi')

    const [url, options] = appels.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).not.toContain('conferenceDataVersion')
    const envoi = JSON.parse(options.body)
    expect(envoi.location).toBe(resultat.lienVisio)
    expect(envoi.description).toContain(resultat.lienVisio)
  })
})
