import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Même garde-fou que supprimer-rendez-vous.ts, pour les événements d'agenda admin (0044) : jamais
   de suppression définitive sur un événement encore actif, seulement sur un déjà `annule`. */

vi.mock('../../_lib/adminAuth.js', () => ({
  requireAdmin: vi.fn(async () => ({ serviceClient: clientFactice(), profileId: 'admin-1', etablissementId: 'etab-1' })),
  AdminAuthError: class AdminAuthError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

const supprimerEvenement = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/google.js', () => ({
  integrationDeLEtablissement: vi.fn(async () => null),
  supprimerEvenement: (...args: unknown[]) => supprimerEvenement(...args),
}))

let evenementRetourne: Record<string, unknown> | null = null
let suppressionAppelee = false

function clientFactice() {
  return {
    from(table: string) {
      if (table !== 'evenements_admin') throw new Error('table inattendue dans ce test : ' + table)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: evenementRetourne }),
          }),
        }),
        delete: () => ({
          eq: async () => {
            suppressionAppelee = true
            return { error: null }
          },
        }),
      }
    },
  }
}

const { default: handler } = await import('../supprimer-evenement.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/supprimer-evenement', { method: 'POST', body: JSON.stringify(corps) })
}

beforeEach(() => {
  evenementRetourne = null
  suppressionAppelee = false
  supprimerEvenement.mockClear()
})

describe('api/admin/supprimer-evenement', () => {
  it('supprime un événement annulé', async () => {
    evenementRetourne = { id: 'evt-1', etablissement_id: 'etab-1', annule: true, google_event_id: null }
    const reponse = await handler(requete({ evenementId: 'evt-1' }))
    expect(reponse.status).toBe(200)
    expect(suppressionAppelee).toBe(true)
  })

  it('refuse de supprimer un événement encore actif', async () => {
    evenementRetourne = { id: 'evt-2', etablissement_id: 'etab-1', annule: false, google_event_id: null }
    const reponse = await handler(requete({ evenementId: 'evt-2' }))
    expect(reponse.status).toBe(409)
    expect(suppressionAppelee).toBe(false)
  })

  it('renvoie 404 pour un événement introuvable', async () => {
    const reponse = await handler(requete({ evenementId: 'inconnu' }))
    expect(reponse.status).toBe(404)
  })

  it('refuse sans evenementId', async () => {
    const reponse = await handler(requete({}))
    expect(reponse.status).toBe(400)
  })
})
