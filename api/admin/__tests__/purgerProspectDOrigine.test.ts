import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-19 : « il faut que la suppression soit totale et sans historique
   bloquant pour le ré-ajout ». Supprimer un compte le faisait bien disparaître de tous les écrans,
   mais le prospect dont il était né restait en base et faisait refuser toute nouvelle inscription
   du même nom depuis la page publique (cinq comptes dans ce cas en production).

   Le point délicat verrouillé ici : cette purge ne doit JAMAIS emporter l'historique financier,
   règle fondatrice de supprimer-utilisateur.ts (« SAUF les historiques de paiement »). Chaque
   ligne est donc détachée du prospect, et une ligne encore sans titulaire étudiant reçoit celui du
   compte supprimé — sinon la contrainte `student_payments_titulaire` (0056) la rejetterait et
   l'encaissement deviendrait anonyme. */

vi.mock('../../_lib/adminAuth.js', () => ({
  requireAdmin: vi.fn(),
  AdminAuthError: class AdminAuthError extends Error {},
}))
vi.mock('../../_lib/google.js', () => ({ integrationHoteReunion: vi.fn(), supprimerEvenement: vi.fn() }))
vi.mock('../../_lib/synchroniserVisio.js', () => ({ annulerVisio: vi.fn() }))
vi.mock('../../_lib/notifications.js', () => ({ formaterDateSeance: vi.fn(), notifierParticipantsSeance: vi.fn() }))

const { purgerProspectDOrigine } = await import('../supprimer-utilisateur.js')

let paiements: { id: string; student_id: string | null }[] = []
const misesAJour: { id: string; champs: Record<string, unknown> }[] = []
let prospectSupprime: string | null = null
let diagnosticsSupprimes: string | null = null

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'student_payments') {
        return {
          select: () => ({ eq: async () => ({ data: paiements }) }),
          update: (champs: Record<string, unknown>) => ({
            eq: async (_colonne: string, id: string) => {
              misesAJour.push({ id, champs })
              return { error: null }
            },
          }),
        }
      }
      if (table === 'diagnostic_calls') {
        return {
          delete: () => ({
            eq: async (_colonne: string, id: string) => {
              diagnosticsSupprimes = id
              return { error: null }
            },
          }),
        }
      }
      if (table === 'prospects') {
        return {
          delete: () => ({
            eq: async (_colonne: string, id: string) => {
              prospectSupprime = id
              return { error: null }
            },
          }),
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  } as never
}

beforeEach(() => {
  paiements = []
  misesAJour.length = 0
  prospectSupprime = null
  diagnosticsSupprimes = null
})

describe('purgerProspectDOrigine', () => {
  it('ne fait rien pour un compte né sans prospect', async () => {
    await purgerProspectDOrigine(clientFactice(), 'profil-1', null)
    expect(prospectSupprime).toBeNull()
    expect(misesAJour).toEqual([])
  })

  it('supprime le prospect et son appel de diagnostic', async () => {
    await purgerProspectDOrigine(clientFactice(), 'profil-1', 'prospect-1')
    expect(diagnosticsSupprimes).toBe('prospect-1')
    expect(prospectSupprime).toBe('prospect-1')
  })

  it('détache l’encaissement sans l’effacer, en gardant son titulaire étudiant', async () => {
    paiements = [{ id: 'paiement-1', student_id: 'profil-1' }]
    await purgerProspectDOrigine(clientFactice(), 'profil-1', 'prospect-1')
    expect(misesAJour).toEqual([{ id: 'paiement-1', champs: { prospect_id: null, student_id: 'profil-1' } }])
    expect(prospectSupprime).toBe('prospect-1')
  })

  it('rattache au compte supprimé une ligne qui n’avait que le prospect pour titulaire', async () => {
    // Sans cela, `prospect_id: null` sur une ligne sans `student_id` violerait
    // `student_payments_titulaire` et l'encaissement n'aurait plus de nom.
    paiements = [{ id: 'paiement-1', student_id: null }]
    await purgerProspectDOrigine(clientFactice(), 'profil-1', 'prospect-1')
    expect(misesAJour[0].champs).toEqual({ prospect_id: null, student_id: 'profil-1' })
  })

  it('détache toutes les lignes avant de supprimer, jamais une seule', async () => {
    paiements = [
      { id: 'paiement-1', student_id: 'profil-1' },
      { id: 'paiement-2', student_id: null },
    ]
    await purgerProspectDOrigine(clientFactice(), 'profil-1', 'prospect-1')
    expect(misesAJour.map((m) => m.id)).toEqual(['paiement-1', 'paiement-2'])
    expect(prospectSupprime).toBe('prospect-1')
  })
})
