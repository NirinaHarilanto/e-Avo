import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-27 : un étudiant peut avoir plusieurs professeurs, et retirer l'un
   d'eux doit annuler SES séances à venir — décision explicite du client, « annulées, à
   replanifier », pas transférées au professeur restant.
   Ce qui est verrouillé ici : on n'annule que les séances futures encore planifiées de CE
   professeur, l'annulation passe par le helper partagé (donc la réunion Google est bien retirée),
   une seule notification consolidée part, et la clôture de l'affectation vient APRÈS les
   annulations. */

let affectationCible: Record<string, unknown> | null = null
let inscriptionsRetournees: Record<string, unknown>[] = []
let filtresInscriptions: Record<string, unknown> = {}
let misesAJourAffectation: { valeurs: unknown; id: unknown; seulementActive: boolean }[] = []
let erreurCloture: { message: string } | null = null

vi.mock('../../_lib/adminAuth.js', () => ({
  requireAdmin: vi.fn(async (..._args: unknown[]) => ({
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

const annulerUneSeance = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/annulerSeance.js', () => ({
  annulerUneSeance: (...args: unknown[]) => annulerUneSeance(...args),
}))

const notifierParticipantsSeance = vi.fn(async (..._args: unknown[]) => {})
const notifierAdminsMouvementPlanning = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/notifications.js', () => ({
  formaterDateSeance: (iso: string) => iso,
  notifierParticipantsSeance: (...args: unknown[]) => notifierParticipantsSeance(...args),
  notifierAdminsMouvementPlanning: (...args: unknown[]) => notifierAdminsMouvementPlanning(...args),
}))

const signalerSynchro = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/synchro.js', () => ({
  signalerSynchro: (...args: unknown[]) => signalerSynchro(...args),
}))

/* Faux client Supabase : un constructeur de requête chaînable qui enregistre les filtres posés
   et se résout en `data` quand on l'attend. Reproduit le comportement de postgrest-js juste
   assez pour que la route s'exécute telle quelle. */
function requeteChainable(data: unknown, journal?: Record<string, unknown>) {
  const builder: Record<string, unknown> = {}
  const enregistrer = (colonne: string, valeur: unknown) => {
    if (journal) journal[colonne] = valeur
    return builder
  }
  builder.select = () => builder
  builder.eq = (colonne: string, valeur: unknown) => enregistrer(colonne, valeur)
  builder.gte = (colonne: string, valeur: unknown) => enregistrer(`${colonne}_min`, valeur)
  builder.is = (colonne: string, valeur: unknown) => enregistrer(`${colonne}_is`, valeur)
  builder.single = async () => ({ data, error: data ? null : { message: 'introuvable' } })
  builder.then = (resoudre: (valeur: unknown) => unknown) => resoudre({ data, error: null })
  return builder
}

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'teacher_assignments') {
        return {
          select: () => requeteChainable(affectationCible),
          update: (valeurs: unknown) => ({
            eq: (_colonne: string, id: unknown) => ({
              is: async (colonne: string, valeur: unknown) => {
                misesAJourAffectation.push({ valeurs, id, seulementActive: colonne === 'date_fin' && valeur === null })
                return { error: erreurCloture }
              },
            }),
          }),
        }
      }
      if (table === 'session_enrollments') {
        return { select: () => requeteChainable(inscriptionsRetournees, filtresInscriptions) }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../retirer-professeur.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/retirer-professeur', { method: 'POST', body: JSON.stringify(corps) })
}

function seance(id: string, debut: string) {
  return { id, teacher_id: 'prof-a', statut: 'planifiee', etablissement_id: 'etab-1', debut, duree_minutes: 60, type: 'individuel' }
}

beforeEach(() => {
  affectationCible = { id: 'aff-a', student_id: 'eleve-1', teacher_id: 'prof-a', date_fin: null, etablissement_id: 'etab-1' }
  inscriptionsRetournees = []
  filtresInscriptions = {}
  misesAJourAffectation = []
  erreurCloture = null
  annulerUneSeance.mockClear()
  notifierParticipantsSeance.mockClear()
  notifierAdminsMouvementPlanning.mockClear()
  signalerSynchro.mockClear()
})

describe('api/admin/retirer-professeur', () => {
  it('annule les séances à venir du professeur retiré, puis clôture son affectation', async () => {
    inscriptionsRetournees = [
      { session_id: 's2', sessions: seance('s2', '2026-11-10T08:00:00.000Z') },
      { session_id: 's1', sessions: seance('s1', '2026-11-03T08:00:00.000Z') },
    ]

    const reponse = await handler(requete({ affectationId: 'aff-a', motif: 'Réorganisation' }))
    const corps = (await reponse.json()) as { ok: boolean; seancesAnnulees: number }

    expect(reponse.status).toBe(200)
    expect(corps).toEqual({ ok: true, seancesAnnulees: 2 })
    expect(annulerUneSeance).toHaveBeenCalledTimes(2)
    // Chronologique : la plus proche d'abord, c'est elle qui sert de référence à la notification.
    expect((annulerUneSeance.mock.calls[0] as unknown[])[1]).toMatchObject({ id: 's1' })
    expect(misesAJourAffectation).toEqual([
      { valeurs: { date_fin: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), motif_changement: 'Réorganisation' }, id: 'aff-a', seulementActive: true },
    ])
  })

  it('ne cherche que les séances individuelles encore planifiées de ce professeur avec cet élève', async () => {
    await handler(requete({ affectationId: 'aff-a' }))

    expect(filtresInscriptions).toMatchObject({
      student_id: 'eleve-1',
      teacher_assignment_id: 'aff-a',
      'sessions.statut': 'planifiee',
      'sessions.type': 'individuel',
      'sessions.teacher_id': 'prof-a',
    })
    // Une séance passée ne se détricote pas : ses heures sont déjà décomptées.
    expect(filtresInscriptions['sessions.debut_min']).toEqual(expect.any(String))
  })

  it('prévient l’élève et l’administration une seule fois pour tout le lot', async () => {
    inscriptionsRetournees = [
      { session_id: 's1', sessions: seance('s1', '2026-11-03T08:00:00.000Z') },
      { session_id: 's2', sessions: seance('s2', '2026-11-10T08:00:00.000Z') },
      { session_id: 's3', sessions: seance('s3', '2026-11-17T08:00:00.000Z') },
    ]

    await handler(requete({ affectationId: 'aff-a' }))

    expect(notifierParticipantsSeance).toHaveBeenCalledTimes(1)
    expect(notifierAdminsMouvementPlanning).toHaveBeenCalledTimes(1)
    const params = (notifierParticipantsSeance.mock.calls[0] as unknown[])[1] as { message: string; sessionId: string }
    expect(params.sessionId).toBe('s1')
    expect(params.message).toContain('3 séances')
    expect(params.message).toContain('replanifier')
  })

  it('retire un professeur sans séance à venir, sans prévenir personne', async () => {
    await handler(requete({ affectationId: 'aff-a' }))

    expect(annulerUneSeance).not.toHaveBeenCalled()
    expect(notifierParticipantsSeance).not.toHaveBeenCalled()
    expect(misesAJourAffectation).toHaveLength(1)
    // Aucune notification n'a été émise, donc aucun signal de rafraîchissement n'est encore parti.
    expect(signalerSynchro).toHaveBeenCalledWith('etab-1')
  })

  it('refuse une affectation déjà clôturée', async () => {
    affectationCible = { id: 'aff-a', student_id: 'eleve-1', teacher_id: 'prof-a', date_fin: '2026-10-20', etablissement_id: 'etab-1' }

    const reponse = await handler(requete({ affectationId: 'aff-a' }))

    expect(reponse.status).toBe(409)
    expect(misesAJourAffectation).toHaveLength(0)
    expect(annulerUneSeance).not.toHaveBeenCalled()
  })

  it('refuse une affectation d’un autre établissement', async () => {
    affectationCible = { id: 'aff-a', student_id: 'eleve-1', teacher_id: 'prof-a', date_fin: null, etablissement_id: 'autre-etab' }

    const reponse = await handler(requete({ affectationId: 'aff-a' }))

    expect(reponse.status).toBe(404)
    expect(misesAJourAffectation).toHaveLength(0)
  })

  it('ne laisse pas croire au succès si la clôture échoue', async () => {
    erreurCloture = { message: 'contrainte' }
    inscriptionsRetournees = [{ session_id: 's1', sessions: seance('s1', '2026-11-03T08:00:00.000Z') }]

    const reponse = await handler(requete({ affectationId: 'aff-a' }))

    expect(reponse.status).toBe(500)
  })
})
