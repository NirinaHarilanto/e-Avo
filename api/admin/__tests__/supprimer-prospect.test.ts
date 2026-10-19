import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Incident du 2026-10-19 (capture client à l'appui, candidat collectif « Ludivic bensas ») :
   supprimer un candidat qui avait réglé ses frais était impossible, quoi que fasse l'admin. Deux
   causes empilées, l'une derrière l'autre :
     1. le refus renvoyait vers la section Paiements de la fiche… où la ligne était invisible tant
        que le candidat n'était pas converti. Impasse complète.
     2. et même une fois la ligne traitée, son soft-delete (`supprime_le`) gardait son
        `prospect_id` — `student_payments.prospect_id` (0056) n'a volontairement ni cascade ni
        `set null` —, donc le `delete from prospects` échouait ensuite sur une violation de clé
        étrangère, affichée brute à l'écran.

   Décision client : « tout emporter, après confirmation du montant ». Ces tests verrouillent
   cette règle en trois temps : sans confirmation la route refuse MAIS renvoie les montants, avec
   confirmation elle efface tout, et une ligne appartenant déjà au dossier d'un élève reste
   refusée dans tous les cas. */

vi.mock('../../_lib/adminAuth.js', () => ({
  requireAdmin: vi.fn(async () => ({
    serviceClient: clientFactice(),
    profileId: 'admin-1',
    etablissementId: 'etab-1',
  })),
  AdminAuthError: class AdminAuthError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

let prospectsEnBase: Record<string, unknown>[] = []
let paiementsEnBase: Record<string, unknown>[] = []
let paiementsPurges: string[] = []
let prospectsSupprimes: string[] = []
let diagnosticsSupprimes = false
let nombreFactures = 0

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'prospects') {
        return {
          select: () => ({ in: async () => ({ data: prospectsEnBase, error: null }) }),
          delete: () => ({
            in: (_colonne: string, ids: string[]) => ({
              eq: async () => {
                prospectsSupprimes = ids
                return { error: null, count: ids.length }
              },
            }),
          }),
        }
      }
      if (table === 'student_payments') {
        return {
          select: () => ({ in: async () => ({ data: paiementsEnBase, error: null }) }),
          delete: () => ({
            in: async (_colonne: string, ids: string[]) => {
              paiementsPurges = [...paiementsPurges, ...ids]
              return { error: null }
            },
          }),
        }
      }
      if (table === 'invoices') {
        return { select: () => ({ in: async () => ({ count: nombreFactures, error: null }) }) }
      }
      if (table === 'diagnostic_calls') {
        return {
          delete: () => ({
            in: async () => {
              diagnosticsSupprimes = true
              return { error: null }
            },
          }),
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../supprimer-prospect.js')

function requete(prospectIds: string[], confirmerSuppressionFinanciere = false) {
  return new Request('https://exemple.test/api/admin/supprimer-prospect', {
    method: 'POST',
    body: JSON.stringify({ prospectIds, confirmerSuppressionFinanciere }),
  })
}

function paiement(champs: Partial<Record<string, unknown>> = {}) {
  return { id: 'paiement-1', student_id: null, supprime_le: null, montant: 150000, montant_regle: 150000, devise: 'Ar', notes: null, ...champs }
}

beforeEach(() => {
  prospectsEnBase = [{ id: 'prospect-1', etablissement_id: 'etab-1', statut: 'diagnostic_fait' }]
  paiementsEnBase = []
  paiementsPurges = []
  prospectsSupprimes = []
  diagnosticsSupprimes = false
  nombreFactures = 0
})

describe('api/admin/supprimer-prospect', () => {
  it('supprime un prospect sans aucune ligne financière, sans toucher aux paiements', async () => {
    const reponse = await handler(requete(['prospect-1']))
    expect(reponse.status).toBe(200)
    expect(prospectsSupprimes).toEqual(['prospect-1'])
    expect(diagnosticsSupprimes).toBe(true)
    expect(paiementsPurges).toEqual([])
  })

  it('sans confirmation, refuse un encaissement actif MAIS renvoie son montant à afficher', async () => {
    paiementsEnBase = [paiement({ notes: 'Frais d’inscription' })]
    const reponse = await handler(requete(['prospect-1']))
    expect(reponse.status).toBe(409)
    expect(await reponse.json()).toMatchObject({
      error: expect.stringContaining('confirmez'),
      lignesFinancieres: [{ id: 'paiement-1', montant: 150000, montantRegle: 150000, devise: 'Ar', libelle: 'Frais d’inscription' }],
    })
    /* Rien n'a bougé : ce premier passage ne sert qu'à montrer ce qui serait effacé. */
    expect(paiementsPurges).toEqual([])
    expect(prospectsSupprimes).toEqual([])
  })

  it('avec confirmation, efface l’encaissement actif et le prospect', async () => {
    paiementsEnBase = [paiement()]
    const reponse = await handler(requete(['prospect-1'], true))
    expect(reponse.status).toBe(200)
    expect(paiementsPurges).toEqual(['paiement-1'])
    expect(prospectsSupprimes).toEqual(['prospect-1'])
  })

  it('purge sans confirmation les paiements déjà supprimés en douceur', async () => {
    /* Aucune ligne active : rien à montrer, donc aucune deuxième confirmation à demander. Mais la
       ligne doit bien partir, sinon son `prospect_id` fait échouer le DELETE du prospect. */
    paiementsEnBase = [paiement({ supprime_le: '2026-10-19T10:00:00Z' })]
    const reponse = await handler(requete(['prospect-1']))
    expect(reponse.status).toBe(200)
    expect(paiementsPurges).toEqual(['paiement-1'])
    expect(prospectsSupprimes).toEqual(['prospect-1'])
  })

  it('refuse si une ligne financière appartient aussi au dossier d’un élève, même confirmée', async () => {
    paiementsEnBase = [paiement({ student_id: 'eleve-1', supprime_le: '2026-10-19T10:00:00Z' })]
    const reponse = await handler(requete(['prospect-1'], true))
    expect(reponse.status).toBe(409)
    expect(await reponse.json()).toMatchObject({ error: expect.stringContaining('dossier financier') })
    expect(paiementsPurges).toEqual([])
    expect(prospectsSupprimes).toEqual([])
  })

  it('refuse si une facture est rattachée à l’encaissement', async () => {
    paiementsEnBase = [paiement()]
    nombreFactures = 1
    const reponse = await handler(requete(['prospect-1'], true))
    expect(reponse.status).toBe(409)
    expect(await reponse.json()).toMatchObject({ error: expect.stringContaining('facture') })
    expect(paiementsPurges).toEqual([])
    expect(prospectsSupprimes).toEqual([])
  })

  it('traite une paire DUO d’un bloc', async () => {
    prospectsEnBase = [
      { id: 'prospect-1', etablissement_id: 'etab-1', statut: 'diagnostic_fait' },
      { id: 'prospect-2', etablissement_id: 'etab-1', statut: 'diagnostic_fait' },
    ]
    paiementsEnBase = [paiement({ id: 'paiement-1' }), paiement({ id: 'paiement-2', supprime_le: '2026-10-19T10:00:00Z' })]
    const reponse = await handler(requete(['prospect-1', 'prospect-2'], true))
    expect(reponse.status).toBe(200)
    expect(paiementsPurges).toEqual(['paiement-1', 'paiement-2'])
    expect(prospectsSupprimes).toEqual(['prospect-1', 'prospect-2'])
  })

  it('refuse un prospect déjà converti en étudiant', async () => {
    prospectsEnBase = [{ id: 'prospect-1', etablissement_id: 'etab-1', statut: 'etudiant' }]
    const reponse = await handler(requete(['prospect-1']))
    expect(reponse.status).toBe(404)
    expect(prospectsSupprimes).toEqual([])
  })
})
