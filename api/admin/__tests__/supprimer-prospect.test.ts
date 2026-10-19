import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Incident du 2026-10-19 (capture client à l'appui, candidat collectif « Ludovic bensas ») :
   supprimer un candidat qui avait un jour réglé un forfait était impossible à jamais. L'admin
   supprimait d'abord la ligne financière depuis la fiche — un soft-delete (`supprime_le`) —, le
   garde-fou de cette route passait alors (il ne comptait que les lignes ACTIVES), puis le
   `delete from prospects` échouait sur une violation de clé étrangère : `student_payments
   .prospect_id` (0056) n'a volontairement ni cascade ni `set null`, donc la ligne supprimée en
   douceur retenait encore le prospect. Le message d'erreur Postgres brut s'affichait à l'écran.

   Ces tests verrouillent les deux moitiés de la règle : un paiement encore actif bloque toujours
   la suppression (l'argent ne disparaît pas en silence), un paiement déjà traité ne la bloque
   plus jamais. */

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

function requete(prospectIds: string[]) {
  return new Request('https://exemple.test/api/admin/supprimer-prospect', {
    method: 'POST',
    body: JSON.stringify({ prospectIds }),
  })
}

beforeEach(() => {
  prospectsEnBase = [{ id: 'prospect-1', etablissement_id: 'etab-1', statut: 'diagnostic_fait' }]
  paiementsEnBase = []
  paiementsPurges = []
  prospectsSupprimes = []
  diagnosticsSupprimes = false
})

describe('api/admin/supprimer-prospect', () => {
  it('supprime un prospect sans aucune ligne financière, sans toucher aux paiements', async () => {
    const reponse = await handler(requete(['prospect-1']))
    expect(reponse.status).toBe(200)
    expect(prospectsSupprimes).toEqual(['prospect-1'])
    expect(diagnosticsSupprimes).toBe(true)
    expect(paiementsPurges).toEqual([])
  })

  it('refuse tant qu’un paiement de forfait est encore actif', async () => {
    paiementsEnBase = [{ id: 'paiement-1', student_id: null, supprime_le: null }]
    const reponse = await handler(requete(['prospect-1']))
    expect(reponse.status).toBe(409)
    expect(await reponse.json()).toMatchObject({ error: expect.stringContaining('supprimez-le d’abord depuis sa fiche') })
    expect(paiementsPurges).toEqual([])
    expect(prospectsSupprimes).toEqual([])
  })

  it('purge les paiements déjà supprimés en douceur puis supprime le prospect', async () => {
    paiementsEnBase = [{ id: 'paiement-1', student_id: null, supprime_le: '2026-10-19T10:00:00Z' }]
    const reponse = await handler(requete(['prospect-1']))
    expect(reponse.status).toBe(200)
    expect(paiementsPurges).toEqual(['paiement-1'])
    expect(prospectsSupprimes).toEqual(['prospect-1'])
  })

  it('refuse si une ligne financière appartient aussi au dossier d’un élève', async () => {
    paiementsEnBase = [{ id: 'paiement-1', student_id: 'eleve-1', supprime_le: '2026-10-19T10:00:00Z' }]
    const reponse = await handler(requete(['prospect-1']))
    expect(reponse.status).toBe(409)
    expect(await reponse.json()).toMatchObject({ error: expect.stringContaining('dossier financier') })
    expect(paiementsPurges).toEqual([])
    expect(prospectsSupprimes).toEqual([])
  })

  it('traite une paire DUO d’un bloc', async () => {
    prospectsEnBase = [
      { id: 'prospect-1', etablissement_id: 'etab-1', statut: 'diagnostic_fait' },
      { id: 'prospect-2', etablissement_id: 'etab-1', statut: 'diagnostic_fait' },
    ]
    paiementsEnBase = [
      { id: 'paiement-1', student_id: null, supprime_le: '2026-10-19T10:00:00Z' },
      { id: 'paiement-2', student_id: null, supprime_le: '2026-10-19T10:00:00Z' },
    ]
    const reponse = await handler(requete(['prospect-1', 'prospect-2']))
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
