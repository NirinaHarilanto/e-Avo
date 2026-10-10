import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-10 : un rendez-vous refusé ou annulé n'avait plus aucune action
   possible dans sa fiche — ni le reprogrammer, ni l'effacer de l'agenda. Ces tests verrouillent
   le garde-fou central de la nouvelle route de suppression : jamais sur un rendez-vous encore
   actif, pour ne jamais contourner la notification du prospect que fait `annuler-rendez-vous.ts`. */

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

let rendezVousRetourne: Record<string, unknown> | null = null
let suppressionAppelee = false

function clientFactice() {
  return {
    from(table: string) {
      if (table !== 'rendez_vous') throw new Error('table inattendue dans ce test : ' + table)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: rendezVousRetourne }),
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

const { default: handler } = await import('../supprimer-rendez-vous.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/supprimer-rendez-vous', { method: 'POST', body: JSON.stringify(corps) })
}

beforeEach(() => {
  rendezVousRetourne = null
  suppressionAppelee = false
  supprimerEvenement.mockClear()
})

describe('api/admin/supprimer-rendez-vous', () => {
  it('supprime un rendez-vous annulé', async () => {
    rendezVousRetourne = { id: 'rdv-1', etablissement_id: 'etab-1', statut: 'annule', google_event_id: null }
    const reponse = await handler(requete({ rendezVousId: 'rdv-1' }))
    expect(reponse.status).toBe(200)
    expect(suppressionAppelee).toBe(true)
  })

  it('supprime un rendez-vous refusé', async () => {
    rendezVousRetourne = { id: 'rdv-2', etablissement_id: 'etab-1', statut: 'refuse', google_event_id: null }
    const reponse = await handler(requete({ rendezVousId: 'rdv-2' }))
    expect(reponse.status).toBe(200)
    expect(suppressionAppelee).toBe(true)
  })

  it('refuse de supprimer un rendez-vous encore confirmé', async () => {
    rendezVousRetourne = { id: 'rdv-3', etablissement_id: 'etab-1', statut: 'confirme', google_event_id: null }
    const reponse = await handler(requete({ rendezVousId: 'rdv-3' }))
    expect(reponse.status).toBe(409)
    expect(suppressionAppelee).toBe(false)
  })

  it('refuse de supprimer un rendez-vous encore en attente', async () => {
    rendezVousRetourne = { id: 'rdv-4', etablissement_id: 'etab-1', statut: 'en_attente', google_event_id: null }
    const reponse = await handler(requete({ rendezVousId: 'rdv-4' }))
    expect(reponse.status).toBe(409)
    expect(suppressionAppelee).toBe(false)
  })

  it('refuse sans rendezVousId', async () => {
    const reponse = await handler(requete({}))
    expect(reponse.status).toBe(400)
  })

  it('renvoie 404 pour un rendez-vous introuvable', async () => {
    rendezVousRetourne = null
    const reponse = await handler(requete({ rendezVousId: 'inconnu' }))
    expect(reponse.status).toBe(404)
  })
})
