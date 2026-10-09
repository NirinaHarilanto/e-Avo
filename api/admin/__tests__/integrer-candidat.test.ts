import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Bug trouvé le 2026-10-10 (capture client à l'appui) : l'écran affichait « candidat validé »
   (grille officielle du 2026-10-01, 14/20 minimum sans critère noté 1 — `resultatSimulation` dans
   src/lib/recrutement.ts) pendant que cette route refusait TOUJOURS de le faire passer en
   intégration, avec le message « L'avis de la simulation de cours doit être favorable » — un champ
   `simulation.avis` qui appartenait à l'ANCIENNE grille (avis saisi à la main, remplacée le
   2026-10-01) et qu'aucun formulaire actuel n'écrit plus. Tout candidat, quel que soit son
   résultat réel, échouait donc ici.

   Ces tests verrouillent la correction : le serveur doit juger un candidat avec EXACTEMENT la
   même règle que celle affichée à l'écran — recalculée depuis les données, jamais depuis un champ
   mort ni depuis un verdict envoyé par le client (falsifiable). */

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

const creerCompteSansEmail = vi.fn(async (..._args: unknown[]) => ({ data: { user: { id: 'nouveau-prof-1' } }, error: null }))
vi.mock('../../_lib/creerCompte.js', () => ({
  creerCompteSansEmail: (...args: unknown[]) => creerCompteSansEmail(...args),
}))

vi.mock('../../_lib/nomDuplique.js', () => ({
  trouverProfilHomonyme: vi.fn(async () => null),
  messageHomonyme: () => 'Homonyme.',
}))

vi.mock('../../_lib/notifications.js', () => ({
  creerNotification: vi.fn(async () => {}),
}))

let candidatRetourne: Record<string, unknown> | null = null
const misesAJourProfil: Record<string, unknown>[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'candidatures_formateurs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: candidatRetourne }),
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'profiles') {
        return {
          update: (valeurs: Record<string, unknown>) => ({
            eq: async () => {
              misesAJourProfil.push(valeurs)
              return { error: null }
            },
          }),
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../integrer-candidat.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/integrer-candidat', {
    method: 'POST',
    body: JSON.stringify(corps),
  })
}

function grille(notes: number[]) {
  const cles = ['delivrance', 'oral', 'stress', 'activites', 'methode_hoc']
  return Object.fromEntries(cles.map((cle, i) => [cle, notes[i]]))
}

beforeEach(() => {
  candidatRetourne = null
  misesAJourProfil.length = 0
  creerCompteSansEmail.mockClear()
})

describe('api/admin/integrer-candidat — règle de validation de la simulation', () => {
  it('laisse passer un candidat à 14/20 sans critère à 1, même sans le champ `avis` (plus aucun formulaire ne l’écrit)', async () => {
    candidatRetourne = {
      id: 'cand-1',
      statut: 'simulation',
      simulation: grille([3, 3, 3, 3, 2]), // total = 14
      nom: 'Rakoto',
      prenom: 'Ana',
      email: 'ana@exemple.test',
      telephone: null,
      ville: null,
      preselection: {},
      professeur_id: null,
    }

    const reponse = await handler(requete({ candidatureId: 'cand-1' }))
    const corps = (await reponse.json()) as { ok?: boolean; error?: string }

    expect(reponse.status).toBe(200)
    expect(corps.ok).toBe(true)
    expect(creerCompteSansEmail).toHaveBeenCalledTimes(1)
    expect(misesAJourProfil[0]).toMatchObject({ role: 'professeur', statut_integration: 'en_integration' })
  })

  it('refuse un candidat sous les 14/20, avec le message de la grille officielle (pas « avis »)', async () => {
    candidatRetourne = {
      id: 'cand-2',
      statut: 'simulation',
      simulation: grille([2, 2, 2, 3, 3]), // total = 12
      nom: 'Rivot',
      prenom: 'Bo',
      email: 'bo@exemple.test',
      telephone: null,
      ville: null,
      preselection: {},
      professeur_id: null,
    }

    const reponse = await handler(requete({ candidatureId: 'cand-2' }))
    const corps = (await reponse.json()) as { error?: string }

    expect(reponse.status).toBe(400)
    expect(corps.error).toContain('14/20')
    expect(corps.error).not.toContain('avis')
    expect(creerCompteSansEmail).not.toHaveBeenCalled()
  })

  it('refuse un candidat avec un critère bloquant même si le total atteint 14/20', async () => {
    candidatRetourne = {
      id: 'cand-3',
      statut: 'simulation',
      simulation: grille([4, 4, 4, 1, 4]), // total = 17, mais un critère à 1
      nom: 'Tahiry',
      prenom: 'Cy',
      email: 'cy@exemple.test',
      telephone: null,
      ville: null,
      preselection: {},
      professeur_id: null,
    }

    const reponse = await handler(requete({ candidatureId: 'cand-3' }))
    expect(reponse.status).toBe(400)
    expect(creerCompteSansEmail).not.toHaveBeenCalled()
  })

  it('ignore un ancien champ `avis: favorable` resté en base si la grille officielle ne valide pas', async () => {
    // Trace d'une candidature évaluée sous l'ancien système (avant le 2026-10-01) : la route ne
    // doit jamais se fier à ce champ, qui n'a plus aucun sens au regard de la règle actuelle.
    candidatRetourne = {
      id: 'cand-4',
      statut: 'simulation',
      simulation: { ...grille([2, 2, 2, 2, 2]), avis: 'favorable' }, // total = 10
      nom: 'Andria',
      prenom: 'Dax',
      email: 'dax@exemple.test',
      telephone: null,
      ville: null,
      preselection: {},
      professeur_id: null,
    }

    const reponse = await handler(requete({ candidatureId: 'cand-4' }))
    expect(reponse.status).toBe(400)
    expect(creerCompteSansEmail).not.toHaveBeenCalled()
  })

  it('refuse une simulation incomplète (tous les critères ne sont pas encore notés)', async () => {
    candidatRetourne = {
      id: 'cand-5',
      statut: 'simulation',
      simulation: { delivrance: 4, oral: 4 },
      nom: 'Eliane',
      prenom: 'Fy',
      email: 'fy@exemple.test',
      telephone: null,
      ville: null,
      preselection: {},
      professeur_id: null,
    }

    const reponse = await handler(requete({ candidatureId: 'cand-5' }))
    expect(reponse.status).toBe(400)
    expect(creerCompteSansEmail).not.toHaveBeenCalled()
  })
})
