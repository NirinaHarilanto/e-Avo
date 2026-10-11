import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Retirer le dernier participant d'un rendez-vous (plus aucun obligatoire ni optionnel) supprime
   désormais l'événement au lieu de refuser la modification — demande client du 2026-10-11 : « si
   TOUS les participants sont retirés manuellement et volontairement par l'admin, ce rendez-vous
   devrait être supprimé et retiré de l'agenda ». La contrainte CHECK `evenements_admin_participants`
   (0045) interdirait de toute façon d'écrire une ligne à zéro participant. */

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

const integrationHoteReunion = vi.fn(async () => ({ googleEmail: 'hote@exemple.test' }))
const modifierEvenementVisio = vi.fn(async (..._args: unknown[]) => {})
const supprimerEvenementGoogle = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/google.js', () => ({
  integrationHoteReunion: (...args: unknown[]) => integrationHoteReunion(...args),
  modifierEvenementVisio: (...args: unknown[]) => modifierEvenementVisio(...args),
  supprimerEvenement: (...args: unknown[]) => supprimerEvenementGoogle(...args),
}))

const notifierModificationEvenement = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/notifications.js', () => ({
  notifierModificationEvenement: (...args: unknown[]) => notifierModificationEvenement(...args),
}))

let evenementRetourne: Record<string, unknown> | null = null
let suppressionAppelee = false
let misAJourCapture: Record<string, unknown> | null = null

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'evenements_admin') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: evenementRetourne }),
            }),
          }),
          update: (valeurs: Record<string, unknown>) => ({
            eq: async () => {
              misAJourCapture = valeurs
              return { error: null }
            },
          }),
          delete: () => ({
            eq: async () => {
              suppressionAppelee = true
              return { error: null }
            },
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              in: async (_colonne: string, ids: string[]) => ({ data: ids.map((id) => ({ id, email: `${id}@exemple.test` })), error: null }),
            }),
          }),
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../modifier-evenement.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/modifier-evenement', { method: 'POST', body: JSON.stringify(corps) })
}

function evenementActif(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    etablissement_id: 'etab-1',
    google_event_id: null,
    lien_meet: null,
    annule: false,
    debut: '2026-10-20T10:00:00.000Z',
    duree_minutes: 30,
    titre: 'Entretien',
    notes: null,
    participants_obligatoires: ['eleve-1'],
    participants_optionnels: ['prof-1'],
    cree_par: 'admin-1',
    ...overrides,
  }
}

beforeEach(() => {
  evenementRetourne = null
  suppressionAppelee = false
  misAJourCapture = null
  integrationHoteReunion.mockClear()
  modifierEvenementVisio.mockClear()
  supprimerEvenementGoogle.mockClear()
  notifierModificationEvenement.mockClear()
})

describe('api/admin/modifier-evenement', () => {
  it('supprime l’événement quand obligatoires ET optionnels deviennent vides', async () => {
    evenementRetourne = evenementActif()
    const reponse = await handler(requete({ evenementId: 'evt-1', obligatoiresIds: [], optionnelsIds: [] }))
    const corps = await reponse.json()
    expect(reponse.status).toBe(200)
    expect(corps).toEqual({ ok: true, supprime: true })
    expect(suppressionAppelee).toBe(true)
    expect(misAJourCapture).toBeNull()
    expect(notifierModificationEvenement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ anciensIds: ['eleve-1', 'prof-1'], nouveauxIds: [] }),
    )
  })

  it('nettoie l’événement Google lors de la suppression automatique', async () => {
    evenementRetourne = evenementActif({ google_event_id: 'g-1' })
    await handler(requete({ evenementId: 'evt-1', obligatoiresIds: [], optionnelsIds: [] }))
    expect(supprimerEvenementGoogle).toHaveBeenCalledWith(expect.anything(), 'g-1')
  })

  it('met simplement à jour quand il reste au moins un participant', async () => {
    evenementRetourne = evenementActif()
    const reponse = await handler(requete({ evenementId: 'evt-1', obligatoiresIds: ['eleve-1'], optionnelsIds: [] }))
    expect(reponse.status).toBe(200)
    expect(suppressionAppelee).toBe(false)
    expect(misAJourCapture).toEqual({ participants_obligatoires: ['eleve-1'], participants_optionnels: [] })
  })

  it('ne supprime pas si seule la liste des obligatoires est fournie (optionnels non touchés)', async () => {
    evenementRetourne = evenementActif()
    const reponse = await handler(requete({ evenementId: 'evt-1', obligatoiresIds: [] }))
    expect(reponse.status).toBe(200)
    expect(suppressionAppelee).toBe(false)
  })
})
