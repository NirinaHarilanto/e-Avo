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
/* Bonus (0162) : ce que la base rend, et ce que la route y ecrit. */
let bonusRetournes: Record<string, unknown>[] = []
let bonusMarques: { ids: string[]; valeurs: Record<string, unknown> } | null = null
/* Prestations Extra (0163) : ce que la base rend, les filtres qu'on lui a demandes, et ce
   que la route y ecrit. Les FILTRES sont captures parce que c'est eux qui portent la regle
   du client — seule une prestation validee et non encore payee part au releve. */
let extrasRetournes: Record<string, unknown>[] = []
let extrasFiltres: Record<string, unknown> = {}
let extrasMarques: { ids: string[]; valeurs: Record<string, unknown> } | null = null

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
      if (table === 'prestations_extra') {
        return {
          select: () => {
            const chainon = {
              eq: (colonne: string, valeur: unknown) => {
                extrasFiltres[colonne] = valeur
                return chainon
              },
              is: (colonne: string, valeur: unknown) => {
                extrasFiltres[colonne] = valeur
                return chainon
              },
              order: async () => ({ data: extrasRetournes }),
            }
            return chainon
          },
          update: (valeurs: Record<string, unknown>) => ({
            in: async (_colonne: string, ids: string[]) => {
              extrasMarques = { ids, valeurs }
              return { error: null }
            },
          }),
        }
      }
      if (table === 'bonus_professeur') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({ order: async () => ({ data: bonusRetournes }) }),
            }),
          }),
          update: (valeurs: Record<string, unknown>) => ({
            in: async (_colonne: string, ids: string[]) => {
              bonusMarques = { ids, valeurs }
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
  bonusRetournes = []
  bonusMarques = null
  extrasRetournes = []
  extrasFiltres = {}
  extrasMarques = null
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

/* Demande client du 2026-11-17 : « ces bonus apparaîtront sur le timesheet du professeur
   concerné ». Repris à la VALIDATION et non à l'envoi du relevé : c'est l'administration qui les
   accorde, et c'est la validation qui crée la rémunération et la facture. Ce bloc garde les
   quatre conséquences de ce choix — le montant versé, les lignes de la facture, le marquage
   « payé », et le fait qu'un relevé sans bonus ne bouge pas d'un ariary. */
describe('api/admin/traiter-timesheet — bonus (0162)', () => {
  beforeEach(() => {
    timesheetRetourne = {
      id: 'ts-1',
      teacher_id: 'prof-1',
      numero: 'TS-0001',
      statut: 'soumis',
      periode_debut: '2026-10-01',
      periode_fin: '2026-10-31',
      total_heures: 2,
      lignes: [
        { hour_ledger_id: 'h1', session_id: 's1', debut: '2026-10-01T08:00:00.000Z', eleves: 'Élève A', heures: 2, type: 'individuel', taux: 15000, montant: 30000 },
      ],
      lignes_retirees: [],
      commentaire: null,
    }
    professeurRetourne = { taux_horaire_individuel: 15000, taux_horaire_duo: 15000, taux_horaire_collectif: 15000 }
    ecrituresRetournees = [{ id: 'h1', heures: 2, type_facturation: 'individuel', teacher_payment_id: null }]
  })

  it('ajoute les bonus en attente à la rémunération et à la facture', async () => {
    bonusRetournes = [
      { id: 'b-1', montant: 10000, motif: 'Renouvellement du forfait de Aina', accorde_le: '2026-11-10' },
      { id: 'b-2', montant: 5000, motif: 'Bonus exceptionnel', accorde_le: '2026-11-12' },
    ]

    const reponse = await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))
    expect(reponse.status).toBe(200)

    // 2 h x 15 000 = 30 000 d'heures, plus 15 000 de bonus.
    expect(paiementCapture?.montant).toBe(45000)
    expect(factureCapturee?.montant_ttc).toBe(45000)

    const lignes = factureCapturee?.lignes as { description: string; quantite: number; prix_unitaire_ht: number }[]
    const lignesBonus = lignes.filter((l) => l.description.startsWith('Bonus'))
    expect(lignesBonus).toHaveLength(2)
    // Pas d'heures sur un bonus : quantité 1, le montant en prix unitaire.
    expect(lignesBonus[0]).toMatchObject({ quantite: 1, prix_unitaire_ht: 10000 })
    expect(lignesBonus[0].description).toContain('Renouvellement du forfait de Aina')
  })

  /* « Payé », c'est être rattaché à une rémunération — même geste que pour les heures (0029).
     Le relevé est noté au passage, sans quoi un relevé validé afficherait les bonus accordés
     DEPUIS, et son total ne correspondrait plus à la facture émise. */
  it('marque les bonus payés et note le relevé qui les porte', async () => {
    bonusRetournes = [{ id: 'b-1', montant: 10000, motif: 'Renouvellement', accorde_le: '2026-11-10' }]

    await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))

    expect(bonusMarques).toEqual({
      ids: ['b-1'],
      valeurs: { teacher_payment_id: 'paiement-1', timesheet_id: 'ts-1' },
    })
  })

  it('n’écrit rien et ne change aucun montant sans bonus en attente', async () => {
    bonusRetournes = []

    await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))

    expect(bonusMarques).toBeNull()
    expect(paiementCapture?.montant).toBe(30000)
    const lignes = factureCapturee?.lignes as { description: string }[]
    expect(lignes.every((l) => !l.description.startsWith('Bonus'))).toBe(true)
  })

  /* Le montant des HEURES reste celui des heures sur le relevé : l'y mêler ferait un relevé dont
     le total ne correspond plus à heures x taux, et qui se lirait comme une erreur de calcul. */
  it('laisse au relevé le montant de ses seules heures', async () => {
    bonusRetournes = [{ id: 'b-1', montant: 10000, motif: 'Renouvellement', accorde_le: '2026-11-10' }]

    await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))

    expect(timesheetMiseAJour?.montant).toBe(30000)
  })

  it('annonce le nombre de bonus repris et leur total dans sa réponse', async () => {
    bonusRetournes = [
      { id: 'b-1', montant: 10000, motif: 'Renouvellement', accorde_le: '2026-11-10' },
      { id: 'b-2', montant: 10000, motif: 'Renouvellement', accorde_le: '2026-11-11' },
    ]

    const corps = (await (await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))).json()) as {
      bonusRepris: number
      montantBonus: number
    }

    expect(corps).toMatchObject({ bonusRepris: 2, montantBonus: 20000 })
  })
})

/* Demande client du 2026-11-17 : « pour les prestations VALIDÉES, le montant validé sera rajouté
   automatiquement dans le timesheet du professeur également ». Tout tient à ce mot : une
   prestation planifiée est convenue mais pas encore due, une annulée ne le sera jamais. */
describe('api/admin/traiter-timesheet — prestations Extra (0163)', () => {
  beforeEach(() => {
    timesheetRetourne = {
      id: 'ts-1',
      teacher_id: 'prof-1',
      numero: 'TS-0001',
      statut: 'soumis',
      periode_debut: '2026-10-01',
      periode_fin: '2026-10-31',
      total_heures: 2,
      lignes: [
        { hour_ledger_id: 'h1', session_id: 's1', debut: '2026-10-01T08:00:00.000Z', eleves: 'Élève A', heures: 2, type: 'individuel', taux: 15000, montant: 30000 },
      ],
      lignes_retirees: [],
      commentaire: null,
    }
    professeurRetourne = { taux_horaire_individuel: 15000, taux_horaire_duo: 15000, taux_horaire_collectif: 15000 }
    ecrituresRetournees = [{ id: 'h1', heures: 2, type_facturation: 'individuel', teacher_payment_id: null }]
  })

  /* Le garde-fou le plus important : la route ne demande QUE les prestations validées et non
     encore payées. Si ce filtre sautait, une prestation seulement planifiée — ou déjà réglée —
     partirait en paiement sans que rien ne le signale. */
  it('ne réclame que les prestations validées et non encore payées', async () => {
    await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))

    expect(extrasFiltres).toMatchObject({
      teacher_id: 'prof-1',
      statut: 'validee',
      teacher_payment_id: null,
    })
  })

  it('ajoute les prestations à la rémunération et à la facture', async () => {
    extrasRetournes = [
      { id: 'e-1', montant: 50000, type_prestation: 'Atelier', date_prestation: '2026-10-15', lieu: 'En ligne' },
      { id: 'e-2', montant: 20000, type_prestation: 'Traduction', date_prestation: '2026-10-20', lieu: null },
    ]

    const reponse = await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))
    expect(reponse.status).toBe(200)

    // 2 h x 15 000 = 30 000 d'heures, plus 70 000 de prestations.
    expect(paiementCapture?.montant).toBe(100000)
    expect(factureCapturee?.montant_ttc).toBe(100000)

    const lignes = factureCapturee?.lignes as { description: string; quantite: number; prix_unitaire_ht: number }[]
    const lignesExtra = lignes.filter((l) => l.description.startsWith('Prestation'))
    expect(lignesExtra).toHaveLength(2)
    // Un Extra porte son propre montant : quantité 1, jamais une durée.
    expect(lignesExtra[0]).toMatchObject({ quantite: 1, prix_unitaire_ht: 50000 })
    expect(lignesExtra[0].description).toContain('Atelier')
    expect(lignesExtra[0].description).toContain('En ligne')
    // Sans lieu, pas de séparateur orphelin.
    expect(lignesExtra[1].description).not.toContain('·')
  })

  it('marque les prestations payées et note le relevé qui les porte', async () => {
    extrasRetournes = [{ id: 'e-1', montant: 50000, type_prestation: 'Atelier', date_prestation: '2026-10-15', lieu: null }]

    await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))

    expect(extrasMarques).toEqual({
      ids: ['e-1'],
      valeurs: { teacher_payment_id: 'paiement-1', timesheet_id: 'ts-1' },
    })
  })

  it('n’écrit rien et ne change aucun montant sans prestation validée', async () => {
    extrasRetournes = []

    await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))

    expect(extrasMarques).toBeNull()
    expect(paiementCapture?.montant).toBe(30000)
  })

  /* Le relevé garde le montant de ses seules heures : l'y mêler ferait un total qui ne
     correspond plus à heures x taux. */
  it('laisse au relevé le montant de ses seules heures', async () => {
    extrasRetournes = [{ id: 'e-1', montant: 50000, type_prestation: 'Atelier', date_prestation: '2026-10-15', lieu: null }]

    await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))

    expect(timesheetMiseAJour?.montant).toBe(30000)
  })

  /* Bonus ET prestations sur le même relevé : les deux s'additionnent, chacun garde ses lignes. */
  it('cumule bonus et prestations sans les confondre', async () => {
    bonusRetournes = [{ id: 'b-1', montant: 10000, motif: 'Renouvellement', accorde_le: '2026-10-05' }]
    extrasRetournes = [{ id: 'e-1', montant: 50000, type_prestation: 'Atelier', date_prestation: '2026-10-15', lieu: null }]

    const corps = (await (await handler(requete({ timesheetId: 'ts-1', decision: 'valide' }))).json()) as {
      bonusRepris: number
      montantBonus: number
      extrasRepris: number
      montantExtras: number
    }

    expect(paiementCapture?.montant).toBe(90000)
    expect(corps).toMatchObject({ bonusRepris: 1, montantBonus: 10000, extrasRepris: 1, montantExtras: 50000 })

    const lignes = factureCapturee?.lignes as { description: string }[]
    expect(lignes.filter((l) => l.description.startsWith('Bonus'))).toHaveLength(1)
    expect(lignes.filter((l) => l.description.startsWith('Prestation'))).toHaveLength(1)
  })
})
