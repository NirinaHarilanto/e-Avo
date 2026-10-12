import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Même régression qu'annuler-rendez-vous.ts (2026-10-12) : un refus de créneau ramenait
   `prospects.statut` à 'prospect' sans se demander si la personne avait depuis été convertie en
   étudiante — plausible dès qu'une seconde demande de créneau (doublon, ancienne requête) restait
   « en_attente » après la conversion. Verrouille le même garde-fou `.neq('statut', 'etudiant')`. */

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

vi.mock('../../_lib/google.js', () => ({
  integrationDeLEtablissement: vi.fn(async () => null),
  creerEvenementVisio: vi.fn(async () => ({ eventId: null, lienVisio: null })),
  noterErreurGoogle: vi.fn(async () => {}),
  supprimerEvenement: vi.fn(async () => {}),
}))

const envoyerEmail = vi.fn(async (..._args: unknown[]) => ({ ok: true }))
vi.mock('../../_lib/email.js', () => ({
  envoyerEmail: (...args: unknown[]) => envoyerEmail(...args),
  modeleRendezVousConfirme: vi.fn(() => '<p>confirmé</p>'),
  modeleRendezVousRefuse: vi.fn(() => '<p>refusé</p>'),
}))

let rendezVousRetourne: Record<string, unknown> | null = null
let prospectsFiltresCaptures: unknown[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'rendez_vous') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rendezVousRetourne }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'prospects') {
        return {
          update: () => ({
            eq: (...argsEq: unknown[]) => ({
              neq: async (...argsNeq: unknown[]) => {
                prospectsFiltresCaptures.push({ eq: argsEq, neq: argsNeq })
                return { error: null }
              },
            }),
          }),
        }
      }
      if (table === 'etablissements') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nom: 'HOC' } }) }) }) }
      }
      if (table === 'reservation_parametres') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../valider-rendez-vous.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/valider-rendez-vous', { method: 'POST', body: JSON.stringify(corps) })
}

beforeEach(() => {
  rendezVousRetourne = null
  prospectsFiltresCaptures = []
  envoyerEmail.mockClear()
})

describe('api/admin/valider-rendez-vous — refus', () => {
  it('filtre explicitement sur un statut autre que « etudiant » avant de remettre « prospect »', async () => {
    rendezVousRetourne = {
      id: 'rdv-1',
      etablissement_id: 'etab-1',
      debut: '2026-10-12T06:30:00.000Z',
      duree_minutes: 30,
      statut: 'en_attente',
      google_event_id: null,
      prospect_id: 'prospect-1',
      prospects: { nom: 'RANDRIA', prenom: 'Miary', email: 'miary@exemple.test', objectif: null, langue_visee: null, type_programme: null },
    }
    const reponse = await handler(requete({ rendezVousId: 'rdv-1', decision: 'refuser' }))
    expect(reponse.status).toBe(200)
    expect(prospectsFiltresCaptures).toEqual([{ eq: ['id', 'prospect-1'], neq: ['statut', 'etudiant'] }])
  })

  it('refuse un rendez-vous déjà traité', async () => {
    rendezVousRetourne = { id: 'rdv-2', etablissement_id: 'etab-1', statut: 'confirme', prospect_id: 'p2', prospects: { nom: 'X', prenom: 'Y', email: 'x@y.test', objectif: null, langue_visee: null, type_programme: null } }
    const reponse = await handler(requete({ rendezVousId: 'rdv-2', decision: 'refuser' }))
    expect(reponse.status).toBe(409)
  })
})
