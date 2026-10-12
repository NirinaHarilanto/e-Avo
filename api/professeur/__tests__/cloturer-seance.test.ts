import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Verrouille le point d'origine de toute la facturation par type (0126, demande client du
   2026-10-12) : le type figé dans hour_ledger.type_facturation à la clôture doit correspondre
   exactement à la séance réellement donnée — une erreur ici fausserait silencieusement TOUTES les
   rémunérations qui en découlent (payer-professeur.ts, soumettre/traiter-timesheet.ts). */

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

const notifierParticipantsSeance = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/notifications.js', () => ({
  notifierParticipantsSeance: (...args: unknown[]) => notifierParticipantsSeance(...args),
  formaterDateSeance: (iso: string) => iso,
}))

let profilsDuo: Record<string, string | null> = {}
const replierBinomesDuo = vi.fn(async (_c: unknown, studentIds: string[]) => studentIds)
const estBinomeDuo = vi.fn(async (_c: unknown, studentIds: string[]) => {
  if (studentIds.length !== 2) return false
  const [a, b] = studentIds
  return profilsDuo[a] === b || profilsDuo[b] === a
})
vi.mock('../../_lib/duo.js', () => ({
  replierBinomesDuo: (...args: Parameters<typeof replierBinomesDuo>) => replierBinomesDuo(...args),
  estBinomeDuo: (...args: Parameters<typeof estBinomeDuo>) => estBinomeDuo(...args),
}))

let seanceRetournee: Record<string, unknown> | null = null
let ecrituresInserees: Record<string, unknown>[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'sessions') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: seanceRetournee, error: null }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'session_enrollments') {
        return { update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }
      }
      if (table === 'hour_ledger') {
        return {
          insert: async (lignes: Record<string, unknown>[]) => {
            ecrituresInserees = lignes
            return { error: null }
          },
        }
      }
      if (table === 'session_modifications') {
        return { insert: async () => ({ error: null }) }
      }
      if (table === 'session_enrollments_select_dummy') {
        return {}
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../cloturer-seance.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/professeur/cloturer-seance', { method: 'POST', body: JSON.stringify(corps) })
}

beforeEach(() => {
  seanceRetournee = null
  ecrituresInserees = []
  profilsDuo = {}
  notifierParticipantsSeance.mockClear()
  replierBinomesDuo.mockClear()
  estBinomeDuo.mockClear()
})

describe('api/professeur/cloturer-seance — type_facturation (0126)', () => {
  it('marque "collectif" une séance de vague (cohort_id posé), même à deux élèves', async () => {
    seanceRetournee = {
      id: 'seance-1',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-12T08:00:00.000Z',
      duree_minutes: 60,
      cohort_id: 'vague-1',
    }
    const reponse = await handler(
      requete({
        sessionId: 'seance-1',
        presences: [
          { studentId: 'e1', present: true },
          { studentId: 'e2', present: true },
        ],
      }),
    )
    expect(reponse.status).toBe(200)
    // cohort_id posé : jamais besoin d'interroger estBinomeDuo, tranché avant.
    expect(estBinomeDuo).not.toHaveBeenCalled()
    const credit = ecrituresInserees.find((e) => e.type_ecriture === 'credit_professeur')
    expect(credit?.type_facturation).toBe('collectif')
    expect(ecrituresInserees.every((e) => e.type_facturation === 'collectif')).toBe(true)
  })

  /* Régression du 2026-10-13 : une séance planifiée pour plusieurs élèves HORS vague est créée
     `type = 'collectif'` avec `cohort_id` à null (planifier-seances-prevision.ts). En ne lisant
     que `cohort_id`, elle était facturée au taux individuel — professeur sous-payé en silence,
     constaté sur une vraie séance de production avant correction. */
  it('marque "collectif" une séance de type collectif même SANS cohort_id', async () => {
    seanceRetournee = {
      id: 'seance-collectif-hors-vague',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-12T08:00:00.000Z',
      duree_minutes: 60,
      type: 'collectif',
      cohort_id: null,
    }
    const reponse = await handler(
      requete({
        sessionId: 'seance-collectif-hors-vague',
        presences: [
          { studentId: 'e1', present: true },
          { studentId: 'e2', present: true },
          { studentId: 'e3', present: true },
        ],
      }),
    )
    expect(reponse.status).toBe(200)
    expect(estBinomeDuo).not.toHaveBeenCalled()
    expect(ecrituresInserees.every((e) => e.type_facturation === 'collectif')).toBe(true)
  })

  it('marque "duo" une séance individuelle à deux élèves réellement liés en binôme', async () => {
    seanceRetournee = {
      id: 'seance-2',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-12T08:00:00.000Z',
      duree_minutes: 60,
      cohort_id: null,
    }
    profilsDuo = { e2: 'e1' } // e2 (secondaire) pointe vers e1 (principal)
    const reponse = await handler(
      requete({
        sessionId: 'seance-2',
        presences: [
          { studentId: 'e1', present: true },
          { studentId: 'e2', present: true },
        ],
      }),
    )
    expect(reponse.status).toBe(200)
    expect(estBinomeDuo).toHaveBeenCalledWith(expect.anything(), ['e1', 'e2'])
    const credit = ecrituresInserees.find((e) => e.type_ecriture === 'credit_professeur')
    expect(credit?.type_facturation).toBe('duo')
  })

  it('marque "individuel" une séance à deux élèves NON liés en binôme (pas un vrai duo)', async () => {
    seanceRetournee = {
      id: 'seance-3',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-12T08:00:00.000Z',
      duree_minutes: 60,
      cohort_id: null,
    }
    profilsDuo = {} // aucun lien duo_partenaire_id entre e1 et e2
    const reponse = await handler(
      requete({
        sessionId: 'seance-3',
        presences: [
          { studentId: 'e1', present: true },
          { studentId: 'e2', present: true },
        ],
      }),
    )
    expect(reponse.status).toBe(200)
    const credit = ecrituresInserees.find((e) => e.type_ecriture === 'credit_professeur')
    expect(credit?.type_facturation).toBe('individuel')
  })

  it('marque "individuel" une séance à un seul élève', async () => {
    seanceRetournee = {
      id: 'seance-4',
      teacher_id: 'prof-1',
      statut: 'planifiee',
      etablissement_id: 'etab-1',
      debut: '2026-10-12T08:00:00.000Z',
      duree_minutes: 60,
      cohort_id: null,
    }
    const reponse = await handler(requete({ sessionId: 'seance-4', presences: [{ studentId: 'e1', present: true }] }))
    expect(reponse.status).toBe(200)
    const credit = ecrituresInserees.find((e) => e.type_ecriture === 'credit_professeur')
    expect(credit?.type_facturation).toBe('individuel')
  })
})
