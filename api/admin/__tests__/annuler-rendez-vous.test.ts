import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Régression du 2026-10-12, capture client à l'appui : deux candidats DÉJÀ convertis en
   étudiants (François Bryan, Miary RANDRIA) ont réapparu dans la colonne « Nouveaux prospects »
   du pipeline après l'annulation d'un rendez-vous resté associé à leur fiche prospect. Cause
   trouvée en base — `prospects.statut` repassait à 'etudiant' → 'prospect' juste après
   l'annulation, alors que `convert-prospect.ts` ne duplique jamais la ligne `prospects` : c'est
   la MÊME ligne avant et après conversion, donc `annuler-rendez-vous.ts` la touchait aussi bien
   pour un simple prospect que pour un étudiant déjà converti.

   Ce test verrouille le garde-fou : le filtre `.neq('statut', 'etudiant')` doit systématiquement
   accompagner la remise à 'prospect', pour qu'un étudiant déjà converti n'y retombe jamais. */

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

vi.mock('../../_lib/google.js', () => ({
  integrationDeLEtablissement: vi.fn(async () => null),
  supprimerEvenement: vi.fn(async () => {}),
}))

const envoyerEmail = vi.fn(async (..._args: unknown[]) => ({ ok: true }))
vi.mock('../../_lib/email.js', () => ({
  envoyerEmail: (...args: unknown[]) => envoyerEmail(...args),
  modeleRendezVousAnnule: vi.fn(() => '<p>annulé</p>'),
}))

const creerNotification = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/notifications.js', () => ({
  creerNotification: (...args: unknown[]) => creerNotification(...args),
}))

let rendezVousRetourne: Record<string, unknown> | null = null
let compteEtudiantRetourne: Record<string, unknown> | null = null
let prospectsFiltresCaptures: unknown[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'rendez_vous') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rendezVousRetourne }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'prospects') {
        return {
          update: () => ({
            eq: (...argsEq: unknown[]) => ({
              neq: async (...argsNeq: unknown[]) => {
                prospectsFiltresCaptures.push({ eq: argsEq, neq: argsNeq })
                return { error: null }
              },
            }),
          }),
        }
      }
      if (table === 'etablissements') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nom: 'HOC' } }) }) }) }
      }
      if (table === 'reservation_parametres') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: compteEtudiantRetourne }) }) }) }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../annuler-rendez-vous.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/annuler-rendez-vous', { method: 'POST', body: JSON.stringify(corps) })
}

beforeEach(() => {
  rendezVousRetourne = null
  compteEtudiantRetourne = null
  prospectsFiltresCaptures = []
  envoyerEmail.mockClear()
  creerNotification.mockClear()
})

describe('api/admin/annuler-rendez-vous', () => {
  it('filtre explicitement sur un statut autre que « etudiant » avant de remettre « prospect »', async () => {
    rendezVousRetourne = {
      id: 'rdv-1',
      etablissement_id: 'etab-1',
      debut: '2026-10-12T06:30:00.000Z',
      statut: 'confirme',
      google_event_id: null,
      prospect_id: 'prospect-1',
      prospects: { nom: 'RANDRIA', prenom: 'Miary', email: 'miary@exemple.test' },
    }
    const reponse = await handler(requete({ rendezVousId: 'rdv-1' }))
    expect(reponse.status).toBe(200)
    expect(prospectsFiltresCaptures).toEqual([{ eq: ['id', 'prospect-1'], neq: ['statut', 'etudiant'] }])
  })

  it('prévient quand même le compte étudiant déjà converti de l’annulation', async () => {
    rendezVousRetourne = {
      id: 'rdv-2',
      etablissement_id: 'etab-1',
      debut: '2026-10-12T07:00:00.000Z',
      statut: 'confirme',
      google_event_id: null,
      prospect_id: 'prospect-2',
      prospects: { nom: 'Bryan', prenom: 'François', email: 'francois@exemple.test' },
    }
    compteEtudiantRetourne = { id: 'profile-francois' }
    const reponse = await handler(requete({ rendezVousId: 'rdv-2' }))
    expect(reponse.status).toBe(200)
    expect(creerNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ destinataireProfileId: 'profile-francois', type: 'rendez_vous_annule' }),
    )
  })

  it('refuse un rendez-vous déjà clos', async () => {
    rendezVousRetourne = { id: 'rdv-3', etablissement_id: 'etab-1', statut: 'annule', google_event_id: null, prospect_id: 'p3', prospects: null }
    const reponse = await handler(requete({ rendezVousId: 'rdv-3' }))
    expect(reponse.status).toBe(409)
  })
})
