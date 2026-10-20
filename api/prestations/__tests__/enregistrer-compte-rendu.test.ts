import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-20 : « pour les cours corporate & chat and chill, le professeur
   concerné devrait renseigner un compte rendu au moment de la clôture de la séance. Ce compte
   rendu pourra être visible par le professeur [...] et par l'admin [...] ».

   Ces tests verrouillent les trois garde-fous qui distinguent cette route de la clôture
   elle-même : jamais avant la clôture (une prestation planifiée n'a rien eu lieu à rendre
   compte), jamais un autre professeur que celui concerné (même si l'admin peut déjà tout lire,
   seul le professeur « renseigne »), et jamais vide. */

let rolesActuels: Array<'professeur' | 'admin_etablissement'> = ['professeur']
let profileIdActuel = 'prof-1'

vi.mock('../../_lib/teacherAuth.js', () => ({
  requireTeacherOrAdmin: vi.fn(async (..._args: unknown[]) => ({
    serviceClient: clientFactice(),
    profileId: profileIdActuel,
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

let prestationRetournee: Record<string, unknown> | null = null
let misesAJourCapturees: { id: unknown; valeurs: Record<string, unknown> }[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table !== 'prestations_externes') throw new Error('table inattendue dans ce test : ' + table)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: prestationRetournee }),
          }),
        }),
        update: (valeurs: Record<string, unknown>) => ({
          eq: async (_colonne: string, id: unknown) => {
            misesAJourCapturees.push({ id, valeurs })
            return { error: null }
          },
        }),
      }
    },
  }
}

const { default: handler } = await import('../enregistrer-compte-rendu.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/prestations/enregistrer-compte-rendu', { method: 'POST', body: JSON.stringify(corps) })
}

beforeEach(() => {
  rolesActuels = ['professeur']
  profileIdActuel = 'prof-1'
  prestationRetournee = null
  misesAJourCapturees = []
})

describe('api/prestations/enregistrer-compte-rendu', () => {
  it('enregistre le compte rendu d’une prestation terminée, avec sa date', async () => {
    prestationRetournee = { id: 'prestation-1', etablissement_id: 'etab-1', teacher_id: 'prof-1', statut: 'terminee' }
    const reponse = await handler(requete({ prestationId: 'prestation-1', compteRendu: 'Séance axée sur les e-mails professionnels.' }))
    expect(reponse.status).toBe(200)
    expect(misesAJourCapturees).toHaveLength(1)
    expect(misesAJourCapturees[0].id).toBe('prestation-1')
    expect(misesAJourCapturees[0].valeurs.compte_rendu).toBe('Séance axée sur les e-mails professionnels.')
    expect(typeof misesAJourCapturees[0].valeurs.compte_rendu_le).toBe('string')
  })

  it('refuse un compte rendu vide', async () => {
    prestationRetournee = { id: 'prestation-1', etablissement_id: 'etab-1', teacher_id: 'prof-1', statut: 'terminee' }
    const reponse = await handler(requete({ prestationId: 'prestation-1', compteRendu: '   ' }))
    expect(reponse.status).toBe(400)
    expect(misesAJourCapturees).toEqual([])
  })

  it('refuse tant que la prestation n’est pas clôturée', async () => {
    prestationRetournee = { id: 'prestation-1', etablissement_id: 'etab-1', teacher_id: 'prof-1', statut: 'planifiee' }
    const reponse = await handler(requete({ prestationId: 'prestation-1', compteRendu: 'Texte.' }))
    expect(reponse.status).toBe(409)
    expect(misesAJourCapturees).toEqual([])
  })

  it('refuse un autre professeur que celui concerné', async () => {
    profileIdActuel = 'prof-2'
    prestationRetournee = { id: 'prestation-1', etablissement_id: 'etab-1', teacher_id: 'prof-1', statut: 'terminee' }
    const reponse = await handler(requete({ prestationId: 'prestation-1', compteRendu: 'Texte.' }))
    expect(reponse.status).toBe(403)
    expect(misesAJourCapturees).toEqual([])
  })

  it('refuse l’admin : seul le professeur concerné renseigne le compte rendu', async () => {
    profileIdActuel = 'admin-1'
    rolesActuels = ['admin_etablissement']
    prestationRetournee = { id: 'prestation-1', etablissement_id: 'etab-1', teacher_id: 'prof-1', statut: 'terminee' }
    const reponse = await handler(requete({ prestationId: 'prestation-1', compteRendu: 'Texte.' }))
    expect(reponse.status).toBe(403)
    expect(misesAJourCapturees).toEqual([])
  })

  it('refuse une prestation d’un autre établissement', async () => {
    prestationRetournee = { id: 'prestation-1', etablissement_id: 'etab-2', teacher_id: 'prof-1', statut: 'terminee' }
    const reponse = await handler(requete({ prestationId: 'prestation-1', compteRendu: 'Texte.' }))
    expect(reponse.status).toBe(404)
    expect(misesAJourCapturees).toEqual([])
  })
})
