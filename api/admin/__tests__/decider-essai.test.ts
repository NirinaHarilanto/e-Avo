import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Prolonger une séance d'essai (demande client du 2026-10-11, « 1h, 2h ou 3h, voir plus ») :
   contrairement à « poursuivi »/« arrete », elle n'est pas une décision finale — essai_resultat
   reste nul, seul le forfait d'essai s'allonge (total_heures/montant), au tarif horaire du même
   programme. « Poursuivi » et « prolonge » exigent désormais un paiement enregistré dans le même
   appel (demande client du 2026-10-11, même principe que l'ajout de forfait, 0061) : le paiement
   doit être payé avant que la décision ne soit appliquée. */

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
let tarifRetourne: Record<string, unknown> | null = null
let packageInsereCapture: Record<string, unknown> | null = null
let paiementInsereCapture: Record<string, unknown> | null = null
let paiementErreur: { message: string } | null = null

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'packages') {
        return {
          select: (colonnes: string) => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: essaiRetourne }) }),
              maybeSingle: async () => ({ data: tarifRetourne }), // non utilisé pour packages, garde la forme homogène
            }),
          }),
          update: (valeurs: Record<string, unknown>) => ({
            eq: async () => {
              misAJourCapture = valeurs
              return { error: null }
            },
          }),
          insert: (valeurs: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                packageInsereCapture = valeurs
                return { data: { id: 'pkg-complement' }, error: null }
              },
            }),
          }),
        }
      }
      if (table === 'tarifs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tarifHoraireRetourne }) }) }),
              maybeSingle: async () => ({ data: tarifRetourne }),
            }),
          }),
        }
      }
      if (table === 'student_payments') {
        return {
          insert: async (valeurs: Record<string, unknown>) => {
            paiementInsereCapture = valeurs
            return { error: paiementErreur }
          },
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

const paiement = { montantPaiement: 105000, motifPaiement: 'Réglé en espèces' }

beforeEach(() => {
  essaiRetourne = null
  misAJourCapture = null
  tarifHoraireRetourne = { prix: 35000 }
  tarifRetourne = { heures: 30, prix: 700000, titre: '30h', etablissement_id: 'etab-1' }
  packageInsereCapture = null
  paiementInsereCapture = null
  paiementErreur = null
})

describe('api/admin/decider-essai — prolongation', () => {
  it('allonge le forfait d’essai existant au lieu d’en créer un second, et enregistre le paiement payé', async () => {
    essaiRetourne = essaiActif()
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 3, ...paiement }))
    const corps = await reponse.json()
    expect(reponse.status).toBe(200)
    expect(corps).toEqual({ ok: true, decision: 'prolonge', heuresAjoutees: 3, montantAjoute: 105000 })
    expect(misAJourCapture).toEqual({ total_heures: 4, montant: 140000 })
    expect(paiementInsereCapture).toMatchObject({ package_id: 'pkg-1', montant: 105000, statut: 'paye', notes: 'Réglé en espèces' })
  })

  it('ne verrouille pas essai_resultat (pas de champ posé dans la mise à jour)', async () => {
    essaiRetourne = essaiActif()
    await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 1, montantPaiement: 35000, motifPaiement: 'Espèces' }))
    expect(misAJourCapture).not.toHaveProperty('essai_resultat')
  })

  it('refuse une prolongation sans paiement enregistré', async () => {
    essaiRetourne = essaiActif()
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 3 }))
    expect(reponse.status).toBe(400)
    expect(misAJourCapture).toBeNull()
    expect(paiementInsereCapture).toBeNull()
  })

  it('refuse une prolongation sans motif de paiement', async () => {
    essaiRetourne = essaiActif()
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 3, montantPaiement: 105000 }))
    expect(reponse.status).toBe(400)
    expect(misAJourCapture).toBeNull()
  })

  it('refuse une prolongation sans heures positives', async () => {
    essaiRetourne = essaiActif()
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 0, ...paiement }))
    expect(reponse.status).toBe(400)
    expect(misAJourCapture).toBeNull()
  })

  it('refuse si aucun tarif horaire n’est configuré pour ce programme', async () => {
    essaiRetourne = essaiActif()
    tarifHoraireRetourne = null
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 2, ...paiement }))
    expect(reponse.status).toBe(400)
    expect(misAJourCapture).toBeNull()
  })

  it('signale explicitement un paiement qui échoue sans annuler la prolongation déjà enregistrée', async () => {
    essaiRetourne = essaiActif()
    paiementErreur = { message: 'contrainte violée' }
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 2, ...paiement }))
    const corps = await reponse.json()
    expect(reponse.status).toBe(500)
    expect(corps.error).toContain('ajoutées')
    expect(misAJourCapture).not.toBeNull()
  })

  it('refuse de prolonger un essai déjà tranché', async () => {
    essaiRetourne = essaiActif({ essai_resultat: 'arrete' })
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 2, ...paiement }))
    expect(reponse.status).toBe(409)
  })

  it('refuse de prolonger un forfait qui n’est pas un essai', async () => {
    essaiRetourne = essaiActif({ essai: false })
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'prolonge', heuresSupplementaires: 2, ...paiement }))
    expect(reponse.status).toBe(400)
  })
})

describe('api/admin/decider-essai — poursuite (paiement obligatoire)', () => {
  it('crée le forfait complet et le paiement payé qui lui est rattaché', async () => {
    essaiRetourne = essaiActif()
    const reponse = await handler(
      requete({ packageId: 'pkg-1', decision: 'poursuivi', tarifId: 'tarif-30h', montantPaiement: 700000, motifPaiement: 'Virement reçu' }),
    )
    const corps = await reponse.json()
    expect(reponse.status).toBe(200)
    expect(corps).toEqual({ ok: true, decision: 'poursuivi', complementId: 'pkg-complement' })
    expect(packageInsereCapture).toMatchObject({ student_id: 'eleve-1', total_heures: 30, montant: 700000 })
    expect(paiementInsereCapture).toMatchObject({ package_id: 'pkg-complement', montant: 700000, statut: 'paye', notes: 'Virement reçu' })
    expect(misAJourCapture).toMatchObject({ essai_resultat: 'poursuivi' })
  })

  it('refuse de poursuivre sans paiement enregistré', async () => {
    essaiRetourne = essaiActif()
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'poursuivi', tarifId: 'tarif-30h' }))
    expect(reponse.status).toBe(400)
    expect(packageInsereCapture).toBeNull()
  })
})

describe('api/admin/decider-essai — arrêt (aucun paiement requis)', () => {
  it('clôture l’essai sans exiger de paiement', async () => {
    essaiRetourne = essaiActif()
    const reponse = await handler(requete({ packageId: 'pkg-1', decision: 'arrete' }))
    expect(reponse.status).toBe(200)
    expect(paiementInsereCapture).toBeNull()
    expect(misAJourCapture).toMatchObject({ essai_resultat: 'arrete' })
  })
})
