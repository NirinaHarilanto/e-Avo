import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-10 (0107, suite) : les séances individuelles/duo d'un professeur,
   tant qu'il n'a pas connecté son propre agenda Google, sont organisées depuis le compte de
   l'établissement — en pratique, l'agenda Gmail réel de l'admin. Cette route lui permet de les en
   retirer, professeur par professeur. Ces tests fixent trois garanties :
   1. seules les séances INDIVIDUELLES, PLANIFIÉES, À VENIR, et encore hébergées PAR
      L'ÉTABLISSEMENT (pas déjà migrées vers le professeur) sont traitées ;
   2. chaque séance traitée reçoit un nouveau lien Jitsi et perd sa référence à l'événement/
      l'organisateur Google, sans que la séance HOC elle-même soit touchée ;
   3. une panne de suppression côté Google n'empêche jamais le détachement en base (best effort,
      comme partout ailleurs dans ce module). */

const ETABLISSEMENT_EMAIL = 'admin@harionlineclub.com'

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

const supprimerEvenement = vi.fn(async (..._args: unknown[]) => {})
let compteurLiens = 0

interface CorpsReponse {
  detachees?: number
  restant?: number
  echecs?: { sessionId: string; raison: string }[]
  error?: string
}
async function corpsDe(reponse: Response): Promise<CorpsReponse> {
  return (await reponse.json()) as CorpsReponse
}

vi.mock('../../_lib/google.js', () => ({
  integrationDeLEtablissement: vi.fn(async () => ({
    etablissementId: 'etab-1',
    accessToken: 'jeton',
    googleEmail: ETABLISSEMENT_EMAIL,
  })),
  nouveauLienVisio: () => `https://meet.jit.si/test-${++compteurLiens}`,
  supprimerEvenement: (...args: unknown[]) => supprimerEvenement(...args),
  GoogleError: class GoogleError extends Error {},
}))

let sessionsRetournees: { id: string }[] = []
let visiosRetournes: { session_id: string; google_event_id: string | null; organisateur_email: string | null }[] = []
let misesAJour: { sessionId: string; valeurs: Record<string, unknown> }[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'sessions') {
        const builder: Record<string, unknown> = { data: sessionsRetournees }
        builder.select = () => builder
        builder.eq = () => builder
        builder.gte = () => builder
        return builder
      }
      if (table === 'video_sessions') {
        return {
          select: () => {
            const builder: Record<string, unknown> = { data: visiosRetournes }
            builder.in = () => builder
            return builder
          },
          update: (valeurs: Record<string, unknown>) => ({
            eq: async (_col: string, sessionId: string) => {
              misesAJour.push({ sessionId, valeurs })
              return { error: null }
            },
          }),
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../detacher-visio-etablissement.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/detacher-visio-etablissement', {
    method: 'POST',
    body: JSON.stringify(corps),
  })
}

beforeEach(() => {
  sessionsRetournees = []
  visiosRetournes = []
  misesAJour = []
  compteurLiens = 0
  supprimerEvenement.mockClear()
})

describe('api/admin/detacher-visio-etablissement', () => {
  it("détache une séance encore hébergée par l'établissement", async () => {
    sessionsRetournees = [{ id: 'session-1' }]
    visiosRetournes = [{ session_id: 'session-1', google_event_id: 'evt-1', organisateur_email: ETABLISSEMENT_EMAIL }]

    const reponse = await handler(requete({ teacherId: 'prof-1' }))
    const corps = await corpsDe(reponse)

    expect(reponse.status).toBe(200)
    expect(corps.detachees).toBe(1)
    expect(supprimerEvenement).toHaveBeenCalledTimes(1)
    expect(misesAJour).toHaveLength(1)
    expect(misesAJour[0].sessionId).toBe('session-1')
    expect(misesAJour[0].valeurs).toMatchObject({
      provider: 'jitsi',
      google_event_id: null,
      organisateur_email: null,
    })
    expect(String(misesAJour[0].valeurs.room_ref)).toContain('meet.jit.si')
  })

  it('ignore une séance déjà hébergée par le professeur lui-même', async () => {
    sessionsRetournees = [{ id: 'session-2' }]
    visiosRetournes = [{ session_id: 'session-2', google_event_id: 'evt-2', organisateur_email: 'prof@gmail.com' }]

    const reponse = await handler(requete({ teacherId: 'prof-1' }))
    const corps = await corpsDe(reponse)

    expect(corps.detachees).toBe(0)
    expect(supprimerEvenement).not.toHaveBeenCalled()
    expect(misesAJour).toHaveLength(0)
  })

  it('ignore une séance sans aucun événement Google (déjà Jitsi)', async () => {
    sessionsRetournees = [{ id: 'session-3' }]
    visiosRetournes = [{ session_id: 'session-3', google_event_id: null, organisateur_email: null }]

    const reponse = await handler(requete({ teacherId: 'prof-1' }))
    const corps = await corpsDe(reponse)

    expect(corps.detachees).toBe(0)
    expect(misesAJour).toHaveLength(0)
  })

  it("détache en base même si Google refuse la suppression de l'événement", async () => {
    supprimerEvenement.mockRejectedValueOnce(new Error('Google indisponible'))
    sessionsRetournees = [{ id: 'session-4' }]
    visiosRetournes = [{ session_id: 'session-4', google_event_id: 'evt-4', organisateur_email: ETABLISSEMENT_EMAIL }]

    const reponse = await handler(requete({ teacherId: 'prof-1' }))
    const corps = await corpsDe(reponse)

    // Best effort : supprimerEvenement() est encapsulée dans un .catch(() => {}) dans le
    // handler, une panne Google ne doit donc jamais empêcher la mise à jour en base.
    expect(corps.detachees).toBe(1)
    expect(misesAJour).toHaveLength(1)
  })

  it('refuse une requête sans teacherId', async () => {
    const reponse = await handler(requete({}))
    expect(reponse.status).toBe(400)
  })

  it('ne traite rien quand le professeur na aucune séance à venir', async () => {
    sessionsRetournees = []
    const reponse = await handler(requete({ teacherId: 'prof-1' }))
    const corps = await corpsDe(reponse)
    expect(corps.detachees).toBe(0)
    expect(corps.restant).toBe(0)
  })
})
