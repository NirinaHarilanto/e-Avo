import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Prolonger une séance d'essai (demande client du 2026-10-11, « 1h, 2h ou 3h, voir plus ») :
   contrairement à « poursuivi »/« arrete », elle n'est pas une décision finale — essai_resultat
   reste nul, seul le forfait d'essai s'allonge (total_heures/montant), au tarif horaire du même
   programme. */

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

let essaiRetourne: Record<string, unknown> | null = null
let misAJourCapture: Record<string, unknown> | null = null
let tarifHoraireRetourne: Record<string, unknown> | null = null

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'packages') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: essaiRetourne }) }) }),
          }),
          update: (valeurs: Record<string, unknown>) => ({
            eq: async () => {
              misAJourCapture = valeurs
              return { error: null }
            },
          }),
        }
      }
      if (table === 'tarifs') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tarifHoraireRetourne }) }) }) }),
          }),
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../decider-essai.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/decider-essai', { method: 'POST', body: JSON.stringify(corps) })
}

function essaiActif(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-1',
    etablissement_id: 'etab-1',
    student_id: 'eleve-1',
    type_programme: 'individuel',
    essai: true,
    essai_resultat: null,
    tarif_vise_id: null,
    total_heures: 1,
    montant: 35000,
    ...overrides,
  }
}

beforeEach(() => {
  essaiRetourne = null
  misAJourCapture = null
  tarifHoraireRetourne = { prix: 35000 }
})

describe('api/admin/decider-essai — prolongation', () => {
  it('allonge le forfait d’essai existant au lieu d’en créer un second', async () => {
    essaiRetourne = essaiActif()
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 3 }))
    const corps = await reponse.json()
    expect(reponse.status).toBe(200)
    expect(corps).toEqual({ ok: true, decision: 'prolonge', heuresAjoutees: 3, montantAjoute: 105000 })
    expect(misAJourCapture).toEqual({ total_heures: 4, montant: 140000 })
  })

  it('ne verrouille pas essai_resultat (pas de champ posé dans la mise à jour)', async () => {
    essaiRetourne = essaiActif()
    await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 1 }))
    expect(misAJourCapture).not.toHaveProperty('essai_resultat')
  })

  it('refuse une prolongation sans heures positives', async () => {
    essaiRetourne = essaiActif()
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 0 }))
    expect(reponse.status).toBe(400)
    expect(misAJourCapture).toBeNull()
  })

  it('refuse si aucun tarif horaire n’est configuré pour ce programme', async () => {
    essaiRetourne = essaiActif()
    tarifHoraireRetourne = null
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 2 }))
    expect(reponse.status).toBe(400)
    expect(misAJourCapture).toBeNull()
  })

  it('refuse de prolonger un essai déjà tranché', async () => {
    essaiRetourne = essaiActif({ essai_resultat: 'arrete' })
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 2 }))
    expect(reponse.status).toBe(409)
  })

  it('refuse de prolonger un forfait qui n’est pas un essai', async () => {
    essaiRetourne = essaiActif({ essai: false })
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 2 }))
    expect(reponse.status).toBe(400)
  })
})
