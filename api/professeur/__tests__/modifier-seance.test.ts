import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Même demande client que pour l'annulation (annuler-seance.test.ts, 2026-10-12) : pour une
   séance appartenant à une série (0123, `serie_id`), 'serie' doit décaler TOUTES les séances
   sœurs encore planifiées du même delta de temps que celui demandé sur la séance cliquée — la
   date de chacune ne change pas, seule l'heure du jour se décale, comme Google Agenda sur « toute
   la série ». Sans portée précisée, seule la séance cliquée bouge. */

vi.mock('../../_lib/teacherAuth.js', () => ({
  requireTeacherOrAdmin: vi.fn(async (..._args: unknown[]) => ({
    serviceClient: clientFactice(),
    profileId: 'prof-1',
    etablissementId: 'etab-1',
    roles: ['professeur'],
  })),
  TeacherAuthError: class TeacherAuthError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

const deplacerVisio = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/synchroniserVisio.js', () => ({
  deplacerVisio: (...args: unknown[]) => deplacerVisio(...args),
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
let misesAJourCapturees: { id: unknown; valeurs: Record<string, unknown> }[] = []
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
          update: (valeurs: Record<string, unknown>) => ({
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

const { default: handler } = await import('../modifier-seance.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/professeur/modifier-seance', { method: 'POST', body: JSON.stringify(corps) })
}

beforeEach(() => {
  seanceCible = null
  soeursRetournees = []
  misesAJourCapturees = []
  insertionsCapturees = []
  serieIdDemandee = null
  deplacerVisio.mockClear()
  notifierParticipantsSeance.mockClear()
  notifierAdminsMouvementPlanning.mockClear()
})

describe('api/professeur/modifier-seance — portée occurrence/série', () => {
  it("sans portée précisée, ne reprogramme que la séance cliquée même si elle appartient à une série", async () => {
    seanceCible = {
      id: 'seance-1',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-19T08:00:00.000Z',
      duree_minutes: 60,
      serie_id: 'serie-1',
    }
    const reponse = await handler(
      requete({ sessionId: 'seance-1', debut: '2026-10-19T09:00:00.000Z', dureeMinutes: 90, justificatif: 'Imprévu' }),
    )
    expect(reponse.status).toBe(200)
    expect(misesAJourCapturees).toEqual([{ id: 'seance-1', valeurs: { debut: '2026-10-19T09:00:00.000Z', duree_minutes: 90 } }])
    expect(serieIdDemandee).toBeNull()
    expect(notifierParticipantsSeance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ titre: 'Séance reprogrammée' }))
  })

  it("avec portée 'serie', décale toutes les séances sœurs du même delta de temps et applique la même nouvelle durée", async () => {
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
      { id: 'seance-1', debut: '2026-10-19T08:00:00.000Z', duree_minutes: 60 },
      { id: 'seance-2', debut: '2026-10-26T08:00:00.000Z', duree_minutes: 60 },
      { id: 'seance-3', debut: '2026-11-02T08:00:00.000Z', duree_minutes: 60 },
    ]
    const reponse = await handler(
      requete({ sessionId: 'seance-1', debut: '2026-10-19T09:00:00.000Z', dureeMinutes: 90, justificatif: 'Décalage récurrent', portee: 'serie' }),
    )
    expect(reponse.status).toBe(200)
    expect(serieIdDemandee).toBe('serie-1')
    expect(misesAJourCapturees).toEqual([
      { id: 'seance-1', valeurs: { debut: '2026-10-19T09:00:00.000Z', duree_minutes: 90 } },
      { id: 'seance-2', valeurs: { debut: '2026-10-26T09:00:00.000Z', duree_minutes: 90 } },
      { id: 'seance-3', valeurs: { debut: '2026-11-02T09:00:00.000Z', duree_minutes: 90 } },
    ])
    expect(insertionsCapturees).toHaveLength(3)
    expect(deplacerVisio).toHaveBeenCalledTimes(3)
    expect(notifierParticipantsSeance).toHaveBeenCalledTimes(1)
    expect(notifierParticipantsSeance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ titre: 'Série de séances reprogrammée', message: expect.stringContaining('3 séances') }),
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
    const reponse = await handler(
      requete({ sessionId: 'seance-isolee', debut: '2026-10-19T09:00:00.000Z', dureeMinutes: 90, justificatif: 'Imprévu', portee: 'serie' }),
    )
    expect(reponse.status).toBe(400)
    expect(misesAJourCapturees).toEqual([])
  })
})
