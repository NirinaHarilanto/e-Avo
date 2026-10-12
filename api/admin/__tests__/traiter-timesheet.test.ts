import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Verrouille deux choses introduites par 0126 (demande client du 2026-10-12) :
   1. le montant final est recalculé ligne par ligne au taux EN VIGUEUR à la validation (pas
      l'estimation figée à l'envoi) ;
   2. la modification d'un TimeSheet par l'admin — retirer des lignes avant de valider — exige
      une justification, et ne fait jamais payer les lignes retirées. */

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

const creerNotification = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/notifications.js', () => ({
  creerNotification: (...args: unknown[]) => creerNotification(...args),
  formaterDateSeance: (iso: string) => iso,
}))

vi.mock('../../_lib/numerotation.js', () => ({
  numeroSuivant: vi.fn(async (..._args: unknown[]) => 'FAC-0001'),
}))

let timesheetRetourne: Record<string, unknown> | null = null
let professeurRetourne: Record<string, unknown> | null = null
let ecrituresRetournees: Record<string, unknown>[] = []
let liberationIds: string[] = []
let paiementCapture: Record<string, unknown> | null = null
let factureCapturee: Record<string, unknown> | null = null
let timesheetMiseAJour: Record<string, unknown> | null = null
let ledgerPaiementIds: string[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'timesheets') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: timesheetRetourne }) }) }) }),
          update: (valeurs: Record<string, unknown>) => ({
            eq: async () => {
              timesheetMiseAJour = valeurs
              return { error: null }
            },
          }),
        }
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: professeurRetourne }) }) }) }
      }
      if (table === 'hour_ledger') {
        return {
          select: () => ({ eq: async () => ({ data: ecrituresRetournees }) }),
          update: (valeurs: Record<string, unknown>) => ({
            eq: async () => ({ error: null }),
            in: async (_colonne: string, ids: string[]) => {
              if (valeurs.timesheet_id === null) liberationIds = ids
              if (valeurs.teacher_payment_id) ledgerPaiementIds = ids
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
                paiementCapture = valeurs
                return { data: { id: 'paiement-1' }, error: null }
              },
            }),
          }),
        }
      }
      if (table === 'invoices') {
        return {
          insert: (valeurs: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                factureCapturee = valeurs
                return { data: { id: 'facture-1', numero: 'FAC-0001' }, error: null }
              },
            }),
          }),
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../traiter-timesheet.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/traiter-timesheet', { method: 'POST', body: JSON.stringify(corps) })
}

const lignesDeBase = [
  { hour_ledger_id: 'h1', session_id: 's1', debut: '2026-10-01T08:00:00.000Z', eleves: 'Élève A', heures: 1, type: 'individuel', taux: 10000, montant: 10000 },
  { hour_ledger_id: 'h2', session_id: 's2', debut: '2026-10-02T08:00:00.000Z', eleves: 'Classe B', heures: 2, type: 'collectif', taux: 15000, montant: 30000 },
]

beforeEach(() => {
  timesheetRetourne = null
  professeurRetourne = null
  ecrituresRetournees = []
  liberationIds = []
  paiementCapture = null
  factureCapturee = null
  timesheetMiseAJour = null
  ledgerPaiementIds = []
  creerNotification.mockClear()
})

describe('api/admin/traiter-timesheet — validation (0126)', () => {
  it('recalcule le montant au taux EN VIGUEUR, pas l’estimation figée à l’envoi', async () => {
    timesheetRetourne = {
      id: 'ts-1',
      teacher_id: 'prof-1',
      numero: 'TS-0001',
      statut: 'soumis',
      periode_debut: '2026-10-01',
      periode_fin: '2026-10-31',
      total_heures: 3,
      lignes: lignesDeBase, // taux estimés à l'envoi : 10000/15000
      lignes_retirees: [],
      commentaire: null,
    }
    // Le taux individuel a changé depuis l'envoi : 12000 au lieu de 10000.
    professeurRetourne = { taux_horaire_individuel: 12000, taux_horaire_duo: 12000, taux_horaire_collectif: 15000 }
    ecrituresRetournees = [
      { id: 'h1', heures: 1, type_facturation: 'individuel', teacher_payment_id: null },
      { id: 'h2', heures: 2, type_facturation: 'collectif', teacher_payment_id: null },
    ]
    const reponse = await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))
    expect(reponse.status).toBe(200)
    // 1×12000 + 2×15000 = 42000, pas 40000 (l'estimation à l'envoi)
    expect(paiementCapture?.montant).toBe(42000)
    expect(timesheetMiseAJour?.montant).toBe(42000)
    expect(timesheetMiseAJour?.lignes).toEqual(
      expect.arrayContaining([expect.objectContaining({ hour_ledger_id: 'h1', taux: 12000, montant: 12000 })]),
    )
    // La facture reprend le taux EN VIGUEUR par ligne, pas un taux unique pour tout le relevé.
    expect(factureCapturee?.lignes).toEqual([
      expect.objectContaining({ prix_unitaire_ht: 12000, quantite: 1 }),
      expect.objectContaining({ prix_unitaire_ht: 15000, quantite: 2 }),
    ])
  })

  it('refuse de valider si un taux manque pour un type présent sur le relevé', async () => {
    timesheetRetourne = {
      id: 'ts-2',
      teacher_id: 'prof-1',
      numero: 'TS-0002',
      statut: 'soumis',
      periode_debut: '2026-10-01',
      periode_fin: '2026-10-31',
      total_heures: 2,
      lignes: [lignesDeBase[1]],
      lignes_retirees: [],
      commentaire: null,
    }
    professeurRetourne = { taux_horaire_individuel: 10000, taux_horaire_duo: 10000, taux_horaire_collectif: null }
    ecrituresRetournees = [{ id: 'h2', heures: 2, type_facturation: 'collectif', teacher_payment_id: null }]
    const reponse = await handler(requete({ timesheetId: 'ts-2', decision: 'valide' }))
    expect(reponse.status).toBe(400)
    expect(paiementCapture).toBeNull()
  })

  it('exige une justification dès qu’une ligne est retirée, et ne la paie jamais', async () => {
    timesheetRetourne = {
      id: 'ts-3',
      teacher_id: 'prof-1',
      numero: 'TS-0003',
      statut: 'soumis',
      periode_debut: '2026-10-01',
      periode_fin: '2026-10-31',
      total_heures: 3,
      lignes: lignesDeBase,
      lignes_retirees: [],
      commentaire: null,
    }
    professeurRetourne = { taux_horaire_individuel: 10000, taux_horaire_duo: 10000, taux_horaire_collectif: 15000 }
    ecrituresRetournees = [
      { id: 'h1', heures: 1, type_facturation: 'individuel', teacher_payment_id: null },
      { id: 'h2', heures: 2, type_facturation: 'collectif', teacher_payment_id: null },
    ]

    // Sans justification : refusé.
    const sansJustif = await handler(requete({ timesheetId: 'ts-3', decision: 'valide', hourLedgerIdsExclus: ['h2'] }))
    expect(sansJustif.status).toBe(400)
    expect(paiementCapture).toBeNull()

    // Avec justification : la ligne h2 est libérée (jamais payée), seule h1 est facturée.
    const avecJustif = await handler(
      requete({ timesheetId: 'ts-3', decision: 'valide', hourLedgerIdsExclus: ['h2'], justificatifModification: 'Séance incluse à tort' }),
    )
    expect(avecJustif.status).toBe(200)
    expect(liberationIds).toEqual(['h2'])
    expect(paiementCapture?.montant).toBe(10000)
    expect(ledgerPaiementIds).toEqual(['h1'])
    expect(timesheetMiseAJour?.justificatif_modification).toBe('Séance incluse à tort')
    expect(timesheetMiseAJour?.lignes).toHaveLength(1)
    expect(timesheetMiseAJour?.lignes_retirees).toHaveLength(1)
  })

  it('refuse de tout retirer : il ne resterait rien à valider', async () => {
    timesheetRetourne = {
      id: 'ts-4',
      teacher_id: 'prof-1',
      numero: 'TS-0004',
      statut: 'soumis',
      periode_debut: '2026-10-01',
      periode_fin: '2026-10-31',
      total_heures: 1,
      lignes: [lignesDeBase[0]],
      lignes_retirees: [],
      commentaire: null,
    }
    professeurRetourne = { taux_horaire_individuel: 10000, taux_horaire_duo: 10000, taux_horaire_collectif: 15000 }
    ecrituresRetournees = [{ id: 'h1', heures: 1, type_facturation: 'individuel', teacher_payment_id: null }]
    const reponse = await handler(
      requete({ timesheetId: 'ts-4', decision: 'valide', hourLedgerIdsExclus: ['h1'], justificatifModification: 'tout retiré' }),
    )
    expect(reponse.status).toBe(400)
  })

  it('refuse un TimeSheet déjà traité', async () => {
    timesheetRetourne = { id: 'ts-5', statut: 'valide' }
    const reponse = await handler(requete({ timesheetId: 'ts-5', decision: 'valide' }))
    expect(reponse.status).toBe(409)
  })
})
