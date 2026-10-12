import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Verrouille le calcul de rémunération au forfait horaire SELON LE TYPE de chaque écriture
   (0126, demande client du 2026-10-12) — avant ce chantier, un seul taux s'appliquait à toutes
   les heures sans distinction. */

vi.mock('../../_lib/adminAuth.js', () => ({
  requireAdmin: vi.fn(async (..._args: unknown[]) => ({ serviceClient: clientFactice(), profileId: 'admin-1', etablissementId: 'etab-1' })),
  AdminAuthError: class AdminAuthError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

let professeurRetourne: Record<string, unknown> | null = null
let lignesRetournees: Record<string, unknown>[] = []
let paiementInsere: Record<string, unknown> | null = null
let ledgerIdsMisAJour: string[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: professeurRetourne }) }) }) }
      }
      if (table === 'hour_ledger') {
        return {
          select: () => ({ in: async () => ({ data: lignesRetournees }) }),
          update: () => ({
            in: async (_colonne: string, ids: string[]) => {
              ledgerIdsMisAJour = ids
              return { error: null }
            },
          }),
        }
      }
      if (table === 'teacher_payments') {
        return {
          insert: (valeurs: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                paiementInsere = valeurs
                return { data: { id: 'paiement-1' }, error: null }
              },
            }),
          }),
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../payer-professeur.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/payer-professeur', { method: 'POST', body: JSON.stringify(corps) })
}

beforeEach(() => {
  professeurRetourne = null
  lignesRetournees = []
  paiementInsere = null
  ledgerIdsMisAJour = []
})

describe('api/admin/payer-professeur — rémunération selon le type (0126)', () => {
  it('applique le taux correspondant à chaque type et somme un seul montant', async () => {
    professeurRetourne = {
      id: 'prof-1',
      role: 'professeur',
      etablissement_id: 'etab-1',
      taux_horaire_individuel: 10000,
      taux_horaire_duo: 10000,
      taux_horaire_collectif: 15000,
    }
    lignesRetournees = [
      { id: 'h1', heures: 1, teacher_id: 'prof-1', etablissement_id: 'etab-1', type_ecriture: 'credit_professeur', type_facturation: 'individuel', teacher_payment_id: null, timesheet_id: null },
      { id: 'h2', heures: 2, teacher_id: 'prof-1', etablissement_id: 'etab-1', type_ecriture: 'credit_professeur', type_facturation: 'collectif', teacher_payment_id: null, timesheet_id: null },
    ]
    const reponse = await handler(requete({ teacherId: 'prof-1', hourLedgerIds: ['h1', 'h2'] }))
    const corps = (await reponse.json()) as { montant: number; heures: number }
    expect(reponse.status).toBe(200)
    // 1×10000 + 2×15000 = 40000
    expect(corps.montant).toBe(40000)
    expect(corps.heures).toBe(3)
    expect(paiementInsere?.montant).toBe(40000)
    expect(ledgerIdsMisAJour.sort()).toEqual(['h1', 'h2'])
  })

  it('refuse de facturer si le taux du type rencontré est manquant', async () => {
    professeurRetourne = {
      id: 'prof-1',
      role: 'professeur',
      etablissement_id: 'etab-1',
      taux_horaire_individuel: 10000,
      taux_horaire_duo: null,
      taux_horaire_collectif: null,
    }
    lignesRetournees = [
      { id: 'h1', heures: 1, teacher_id: 'prof-1', etablissement_id: 'etab-1', type_ecriture: 'credit_professeur', type_facturation: 'collectif', teacher_payment_id: null, timesheet_id: null },
    ]
    const reponse = await handler(requete({ teacherId: 'prof-1', hourLedgerIds: ['h1'] }))
    expect(reponse.status).toBe(400)
    const corps = (await reponse.json()) as { error?: string }
    expect(corps.error).toMatch(/Collectif/)
    expect(paiementInsere).toBeNull()
  })

  it('traite une écriture sans type_facturation (antérieure à 0126) comme individuelle', async () => {
    professeurRetourne = {
      id: 'prof-1',
      role: 'professeur',
      etablissement_id: 'etab-1',
      taux_horaire_individuel: 10000,
      taux_horaire_duo: 10000,
      taux_horaire_collectif: 15000,
    }
    lignesRetournees = [
      { id: 'h1', heures: 2, teacher_id: 'prof-1', etablissement_id: 'etab-1', type_ecriture: 'credit_professeur', type_facturation: null, teacher_payment_id: null, timesheet_id: null },
    ]
    const reponse = await handler(requete({ teacherId: 'prof-1', hourLedgerIds: ['h1'] }))
    const corps = (await reponse.json()) as { montant: number }
    expect(reponse.status).toBe(200)
    expect(corps.montant).toBe(20000)
  })

  it('refuse une ligne déjà payée ou déjà déclarée sur un TimeSheet', async () => {
    professeurRetourne = { id: 'prof-1', role: 'professeur', etablissement_id: 'etab-1', taux_horaire_individuel: 10000, taux_horaire_duo: null, taux_horaire_collectif: null }
    lignesRetournees = [
      { id: 'h1', heures: 1, teacher_id: 'prof-1', etablissement_id: 'etab-1', type_ecriture: 'credit_professeur', type_facturation: 'individuel', teacher_payment_id: 'deja-paye', timesheet_id: null },
    ]
    const reponse = await handler(requete({ teacherId: 'prof-1', hourLedgerIds: ['h1'] }))
    expect(reponse.status).toBe(400)
  })
})
