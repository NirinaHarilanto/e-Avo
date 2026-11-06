import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-11-05 (icône de retrait) puis du 2026-11-06 (ouverte au professeur,
   capture à l'appui : « est-ce que tu as également rajouté la fonctionnalité [...] dans les
   espaces professeurs ? »). Route partagée admin/professeur, même mécanique que
   annuler-seance.ts et modifier-seance.ts — mais avec une portée volontairement PLUS ÉTROITE
   pour le professeur, posée explicitement par le client :
     — uniquement SES propres séances ;
     — uniquement une séance encore PLANIFIÉE ou déjà ANNULÉE, jamais CLÔTURÉE — ces deux
       statuts-là n'ont jamais écrit au grand livre, donc rien à reverser pour ce chemin.
   L'admin, lui, garde la portée complète : n'importe quelle séance, y compris clôturée, avec
   reversement des écritures. Ce fichier verrouille la frontière entre les deux. */

let rolesActuels: Array<'professeur' | 'admin_etablissement'> = ['professeur']

vi.mock('../../_lib/teacherAuth.js', () => ({
  requireTeacherOrAdmin: vi.fn(async (..._args: unknown[]) => ({
    serviceClient: clientFactice(),
    profileId: 'prof-1',
    etablissementId: 'etab-1',
    roles: rolesActuels,
  })),
  TeacherAuthError: class TeacherAuthError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

const integrationHoteDeLaSession = vi.fn(async (..._args: unknown[]) => null as unknown)
const supprimerEvenement = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/google.js', () => ({
  integrationHoteDeLaSession: (...args: unknown[]) => integrationHoteDeLaSession(...args),
  supprimerEvenement: (...args: unknown[]) => supprimerEvenement(...args),
}))

let seanceCible: Record<string, unknown> | null = null
let ecrituresLedger: Record<string, unknown>[] = []
let videoCible: Record<string, unknown> | null = null
let suppressionsCapturees: { table: string; colonne: string; valeur: unknown }[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: seanceCible }) }),
            }),
          }),
          delete: () => ({
            eq: async (colonne: string, valeur: unknown) => {
              suppressionsCapturees.push({ table: 'sessions', colonne, valeur })
              return { error: null }
            },
          }),
        }
      }
      if (table === 'hour_ledger') {
        return {
          select: () => ({ eq: async () => ({ data: ecrituresLedger }) }),
          delete: () => ({
            eq: async (colonne: string, valeur: unknown) => {
              suppressionsCapturees.push({ table: 'hour_ledger', colonne, valeur })
              return { error: null }
            },
          }),
        }
      }
      if (table === 'video_sessions') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: videoCible }) }) }) }
      }
      if (table === 'session_reports' || table === 'session_satisfaction') {
        return {
          delete: () => ({
            eq: async (colonne: string, valeur: unknown) => {
              suppressionsCapturees.push({ table, colonne, valeur })
              return { error: null }
            },
          }),
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../retirer-seance.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/professeur/retirer-seance', { method: 'POST', body: JSON.stringify(corps) })
}

function seance(statut: string, teacherId = 'prof-1') {
  return { id: 'seance-1', debut: '2026-11-10T08:00:00.000Z', statut, teacher_id: teacherId, etablissement_id: 'etab-1' }
}

beforeEach(() => {
  rolesActuels = ['professeur']
  seanceCible = null
  ecrituresLedger = []
  videoCible = null
  suppressionsCapturees = []
  integrationHoteDeLaSession.mockClear()
  supprimerEvenement.mockClear()
})

describe('api/professeur/retirer-seance — portée du professeur', () => {
  it('retire sa propre séance encore planifiée', async () => {
    seanceCible = seance('planifiee')
    const reponse = await handler(requete({ sessionId: 'seance-1' }))
    expect(reponse.status).toBe(200)
    expect(suppressionsCapturees).toContainEqual({ table: 'sessions', colonne: 'id', valeur: 'seance-1' })
  })

  it('retire sa propre séance déjà annulée', async () => {
    seanceCible = seance('annulee')
    const reponse = await handler(requete({ sessionId: 'seance-1' }))
    expect(reponse.status).toBe(200)
  })

  /* Le cœur de la restriction posée le 2026-11-06 : jamais une séance clôturée depuis l'espace
     professeur, même si c'est la sienne — ses heures sont déjà comptées. */
  it('refuse sa propre séance clôturée', async () => {
    seanceCible = seance('terminee')
    const reponse = await handler(requete({ sessionId: 'seance-1' }))
    expect(reponse.status).toBe(409)
    expect(suppressionsCapturees).toEqual([])
  })

  it('refuse une séance reportée', async () => {
    seanceCible = seance('reportee')
    const reponse = await handler(requete({ sessionId: 'seance-1' }))
    expect(reponse.status).toBe(409)
  })

  /* Un élève peut avoir plusieurs professeurs (0138) : voir la séance sur un dossier partagé ne
     donne aucun droit sur une séance donnée par un collègue. */
  it('refuse la séance d’un autre professeur, même encore planifiée', async () => {
    seanceCible = seance('planifiee', 'prof-2')
    const reponse = await handler(requete({ sessionId: 'seance-1' }))
    expect(reponse.status).toBe(403)
    expect(suppressionsCapturees).toEqual([])
  })
})

describe('api/professeur/retirer-seance — portée de l’admin, inchangée', () => {
  it('retire n’importe quelle séance de l’établissement, y compris clôturée', async () => {
    rolesActuels = ['professeur', 'admin_etablissement']
    seanceCible = seance('terminee', 'prof-2')
    const reponse = await handler(requete({ sessionId: 'seance-1' }))
    expect(reponse.status).toBe(200)
  })

  it('fait revenir les écritures du grand livre d’une séance clôturée', async () => {
    rolesActuels = ['professeur', 'admin_etablissement']
    seanceCible = seance('terminee', 'prof-2')
    ecrituresLedger = [
      { id: 'l-1', heures: 1, type_ecriture: 'debit_etudiant', teacher_payment_id: null, timesheet_id: null },
      { id: 'l-2', heures: 1, type_ecriture: 'credit_professeur', teacher_payment_id: null, timesheet_id: null },
    ]
    const reponse = await handler(requete({ sessionId: 'seance-1' }))
    const corps = (await reponse.json()) as { heuresRetirees: number }
    expect(corps.heuresRetirees).toBe(1)
    expect(suppressionsCapturees).toContainEqual({ table: 'hour_ledger', colonne: 'session_id', valeur: 'seance-1' })
  })

  /* Règle inchangée, commune aux deux rôles : une paie déjà émise ne se réécrit jamais. */
  it('refuse même pour l’admin des heures déjà payées', async () => {
    rolesActuels = ['professeur', 'admin_etablissement']
    seanceCible = seance('terminee', 'prof-2')
    ecrituresLedger = [
      { id: 'l-1', heures: 1, type_ecriture: 'credit_professeur', teacher_payment_id: 'paie-1', timesheet_id: null },
    ]
    const reponse = await handler(requete({ sessionId: 'seance-1' }))
    expect(reponse.status).toBe(409)
    expect(suppressionsCapturees).toEqual([])
  })
})

describe('api/professeur/retirer-seance — divers', () => {
  it('404 sur une séance introuvable', async () => {
    seanceCible = null
    const reponse = await handler(requete({ sessionId: 'inexistante' }))
    expect(reponse.status).toBe(404)
  })

  it('400 sans identifiant de séance', async () => {
    const reponse = await handler(requete({}))
    expect(reponse.status).toBe(400)
  })
})
