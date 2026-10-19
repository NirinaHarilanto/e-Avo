import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-12 : « il faut lui demander si cela concerne uniquement le
   rendez-vous ou la série de rendez-vous ». Verrouille le comportement de `portee` pour les
   séances créées en lot (0123, `serie_id`) : par défaut (ou 'occurrence'), seule la séance
   cliquée est annulée ; 'serie' annule toutes les séances SŒURS encore planifiées, et une seule
   notification consolidée part plutôt qu'une par séance. */

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

const annulerVisio = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/synchroniserVisio.js', () => ({
  annulerVisio: (...args: unknown[]) => annulerVisio(...args),
}))

const notifierParticipantsSeance = vi.fn(async (..._args: unknown[]) => {})
const notifierAdminsMouvementPlanning = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/notifications.js', () => ({
  formaterDateSeance: (iso: string) => iso,
  notifierParticipantsSeance: (...args: unknown[]) => notifierParticipantsSeance(...args),
  notifierAdminsMouvementPlanning: (...args: unknown[]) => notifierAdminsMouvementPlanning(...args),
}))

let seanceCible: Record<string, unknown> | null = null
let soeursRetournees: Record<string, unknown>[] = []
let misesAJourCapturees: { id: unknown; valeurs: unknown }[] = []
let insertionsCapturees: unknown[] = []
let serieIdDemandee: unknown = null

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: (colonne: string, valeur: unknown) => {
              if (colonne === 'id') {
                return { single: async () => ({ data: seanceCible, error: null }) }
              }
              if (colonne === 'serie_id') {
                serieIdDemandee = valeur
                return { eq: async () => ({ data: soeursRetournees }) }
              }
              throw new Error('colonne inattendue : ' + colonne)
            },
          }),
          update: (valeurs: unknown) => ({
            eq: async (_colonne: string, id: unknown) => {
              misesAJourCapturees.push({ id, valeurs })
              return { error: null }
            },
          }),
        }
      }
      if (table === 'session_modifications') {
        return { insert: async (valeurs: unknown) => { insertionsCapturees.push(valeurs); return { error: null } } }
      }
      if (table === 'session_enrollments') {
        return { select: () => ({ eq: async () => ({ data: [] }) }) }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../annuler-seance.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/professeur/annuler-seance', { method: 'POST', body: JSON.stringify(corps) })
}

beforeEach(() => {
  seanceCible = null
  soeursRetournees = []
  misesAJourCapturees = []
  insertionsCapturees = []
  serieIdDemandee = null
  rolesActuels = ['professeur']
  annulerVisio.mockClear()
  notifierParticipantsSeance.mockClear()
  notifierAdminsMouvementPlanning.mockClear()
})

/* Demande client du 2026-10-19 : même raisonnement que modifier-seance.test.ts — la capacité
   réelle de l'acteur est enregistrée à l'écriture, jamais recalculée à la lecture (0132). */
describe('api/professeur/annuler-seance — modifie_par_est_admin', () => {
  it('capture true quand l’acteur a la capacité admin', async () => {
    rolesActuels = ['professeur', 'admin_etablissement']
    seanceCible = {
      id: 'seance-1',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-19T08:00:00.000Z',
      duree_minutes: 60,
      serie_id: null,
    }
    await handler(requete({ sessionId: 'seance-1' }))
    expect(insertionsCapturees).toEqual([expect.objectContaining({ modifie_par_est_admin: true })])
  })
})

describe('api/professeur/annuler-seance — portée occurrence/série', () => {
  it("sans portée précisée, n'annule que la séance cliquée même si elle appartient à une série", async () => {
    seanceCible = {
      id: 'seance-1',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-19T08:00:00.000Z',
      duree_minutes: 60,
      serie_id: 'serie-1',
    }
    const reponse = await handler(requete({ sessionId: 'seance-1' }))
    expect(reponse.status).toBe(200)
    expect(misesAJourCapturees).toEqual([{ id: 'seance-1', valeurs: { statut: 'annulee' } }])
    expect(insertionsCapturees).toHaveLength(1)
    expect(serieIdDemandee).toBeNull()
    expect(notifierParticipantsSeance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ titre: 'Séance annulée' }))
  })

  it("avec portée 'serie', annule toutes les séances sœurs encore planifiées et envoie une seule notification consolidée", async () => {
    seanceCible = {
      id: 'seance-1',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-19T08:00:00.000Z',
      duree_minutes: 60,
      serie_id: 'serie-1',
    }
    soeursRetournees = [
      { id: 'seance-1', teacher_id: 'prof-1', statut: 'planifiee', etablissement_id: 'etab-1', debut: '2026-10-19T08:00:00.000Z', duree_minutes: 60 },
      { id: 'seance-2', teacher_id: 'prof-1', statut: 'planifiee', etablissement_id: 'etab-1', debut: '2026-10-26T08:00:00.000Z', duree_minutes: 60 },
      { id: 'seance-3', teacher_id: 'prof-1', statut: 'planifiee', etablissement_id: 'etab-1', debut: '2026-11-02T08:00:00.000Z', duree_minutes: 60 },
    ]
    const reponse = await handler(requete({ sessionId: 'seance-1', portee: 'serie' }))
    expect(reponse.status).toBe(200)
    expect(serieIdDemandee).toBe('serie-1')
    expect(misesAJourCapturees.map((m) => m.id)).toEqual(['seance-1', 'seance-2', 'seance-3'])
    expect(insertionsCapturees).toHaveLength(3)
    expect(annulerVisio).toHaveBeenCalledTimes(3)
    expect(notifierParticipantsSeance).toHaveBeenCalledTimes(1)
    expect(notifierParticipantsSeance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ titre: 'Série de séances annulée', message: expect.stringContaining('3 séances') }),
    )
    expect(notifierAdminsMouvementPlanning).toHaveBeenCalledTimes(1)
  })

  it("refuse la portée 'serie' sur une séance isolée (sans serie_id)", async () => {
    seanceCible = {
      id: 'seance-isolee',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-19T08:00:00.000Z',
      duree_minutes: 60,
      serie_id: null,
    }
    const reponse = await handler(requete({ sessionId: 'seance-isolee', portee: 'serie' }))
    expect(reponse.status).toBe(400)
    expect(misesAJourCapturees).toEqual([])
  })

  it('refuse toujours une séance déjà annulée ou terminée', async () => {
    seanceCible = {
      id: 'seance-close',
      teacher_id: 'prof-1',
      statut: 'terminee',
      etablissement_id: 'etab-1',
      debut: '2026-10-19T08:00:00.000Z',
      duree_minutes: 60,
      serie_id: 'serie-1',
    }
    const reponse = await handler(requete({ sessionId: 'seance-close', portee: 'serie' }))
    expect(reponse.status).toBe(409)
  })
})
