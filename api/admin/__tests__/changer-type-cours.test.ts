import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-11-08 : « quand un étudiant a complètement fini son forfait de cours ou
   n'a pas encore commencé une séance de cours, on doit pouvoir changer de type de cours [...] il
   faut le rendre techniquement possible de faire le basculement sans casser la logique et les
   mécanismes. »

   « Sans casser les mécanismes » est ce que ce fichier garde, mécanisme par mécanisme : les
   séances à venir (qui resteraient sinon dans l'agenda de tout le monde), l'affectation de
   professeur (qui désignerait un professeur sans cours), le forfait quitté (qui s'additionnerait
   au suivant), et les règlements déjà encaissés (qui ne se réécrivent jamais). */

let parcoursMesure = { forfait: 20 as number | null, consommees: 0 }
vi.mock('../../_lib/finDeForfait.js', () => ({
  mesurerParcours: vi.fn(async () => parcoursMesure),
}))

const annulerUneSeance = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/annulerSeance.js', () => ({
  annulerUneSeance: (...args: unknown[]) => annulerUneSeance(...args),
}))

vi.mock('../../_lib/notifications.js', () => ({
  formaterDateSeance: (iso: string) => iso,
  notifierParticipantsSeance: vi.fn(async () => {}),
  notifierAdminsMouvementPlanning: vi.fn(async () => {}),
}))

vi.mock('../../_lib/synchro.js', () => ({ signalerSynchro: vi.fn(async () => {}) }))

interface Ligne {
  [cle: string]: unknown
}

let base: Record<string, Ligne[]> = {}
let journal: { table: string; operation: string; filtres: Record<string, unknown>; valeurs?: unknown }[] = []

function correspond(ligne: Ligne, filtres: Record<string, unknown>): boolean {
  return Object.entries(filtres).every(([colonne, valeur]) => {
    // Les filtres portant sur la table jointe (`sessions.statut`…) sont posés par le test lui-même
    // en ne fournissant que des lignes déjà conformes : les ignorer ici garde le faux client lisible.
    if (colonne.includes('.') || colonne.endsWith('>=')) return true
    if (Array.isArray(valeur)) return valeur.includes(ligne[colonne])
    return ligne[colonne] === valeur
  })
}

function clientFactice() {
  return {
    from(table: string) {
      const construire = (operation: string, valeurs?: unknown) => {
        const filtres: Record<string, unknown> = {}
        let tete = false
        const chainon = {
          eq(colonne: string, valeur: unknown) {
            filtres[colonne] = valeur
            return chainon
          },
          is(colonne: string, valeur: unknown) {
            filtres[colonne] = valeur
            return chainon
          },
          in(colonne: string, valeur: unknown) {
            filtres[colonne] = valeur
            return chainon
          },
          gte(colonne: string, valeur: unknown) {
            filtres[`${colonne}>=`] = valeur
            return chainon
          },
          async maybeSingle() {
            const lignes = (base[table] ?? []).filter((l) => correspond(l, filtres))
            journal.push({ table, operation, filtres })
            return { data: lignes[0] ?? null, error: null }
          },
          then(resoudre: (valeur: unknown) => unknown, rejeter?: (raison: unknown) => unknown) {
            const lignes = (base[table] ?? []).filter((l) => correspond(l, filtres))
            journal.push({ table, operation, filtres, valeurs })
            if (operation === 'delete') {
              base[table] = (base[table] ?? []).filter((l) => !correspond(l, filtres))
            }
            if (operation === 'update') {
              for (const ligne of lignes) Object.assign(ligne, valeurs as Ligne)
            }
            return Promise.resolve({
              data: tete ? null : lignes,
              error: null,
              count: lignes.length,
            }).then(resoudre, rejeter)
          },
          marquerTete() {
            tete = true
            return chainon
          },
        }
        return chainon
      }

      return {
        select: (_colonnes?: string, options?: { count?: string; head?: boolean }) => {
          const chainon = construire('select')
          return options?.head ? chainon.marquerTete() : chainon
        },
        update: (valeurs: unknown) => construire('update', valeurs),
        delete: () => construire('delete'),
        insert: (valeurs: unknown) => construire('insert', valeurs),
      }
    },
  }
}

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

const { default: handler } = await import('../changer-type-cours.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/changer-type-cours', {
    method: 'POST',
    body: JSON.stringify(corps),
  })
}

function seance(id: string, type: string) {
  return { id, teacher_id: 'prof-1', statut: 'planifiee', etablissement_id: 'etab-1', debut: '2026-11-20T08:00:00.000Z', duree_minutes: 60, type }
}

beforeEach(() => {
  parcoursMesure = { forfait: 20, consommees: 0 }
  journal = []
  annulerUneSeance.mockClear()
  base = {
    profiles: [{ id: 'eleve-1', prenom: 'Aina', nom: 'RAKOTO', status: 'approved', etablissement_id: 'etab-1' }],
    cohort_enrollments: [],
    session_enrollments: [],
    packages: [],
    student_payments: [],
    hour_ledger: [],
    teacher_assignments: [],
  }
})

describe('api/admin/changer-type-cours — qui a le droit de basculer', () => {
  it('refuse un forfait entamé mais pas terminé, sans rien toucher', async () => {
    parcoursMesure = { forfait: 20, consommees: 6 }
    base.packages = [{ id: 'forfait-1', student_id: 'eleve-1', total_heures: 20, type_programme: 'individuel', clos_le: null }]

    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    const corps = (await reponse.json()) as { error: string }

    expect(reponse.status).toBe(409)
    expect(corps.error).toContain('6 h sur 20 h')
    expect(journal.filter((o) => o.operation !== 'select')).toEqual([])
  })

  it('accepte quand aucune heure n’a encore été suivie', async () => {
    parcoursMesure = { forfait: 20, consommees: 0 }
    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    expect(reponse.status).toBe(200)
  })

  it('accepte quand le forfait est entièrement consommé', async () => {
    parcoursMesure = { forfait: 20, consommees: 20 }
    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    expect(reponse.status).toBe(200)
  })

  it('refuse de basculer vers le type déjà en place', async () => {
    base.cohort_enrollments = [{ id: 'insc-1', student_id: 'eleve-1', cohort_id: 'vague-1', cohort_class_id: 'classe-1' }]
    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    expect(reponse.status).toBe(409)
  })

  it('refuse un élève d’un autre établissement', async () => {
    base.profiles = [{ id: 'eleve-1', prenom: 'Aina', nom: 'RAKOTO', status: 'approved', etablissement_id: 'etab-2' }]
    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    expect(reponse.status).toBe(404)
  })

  it('refuse un compte supprimé', async () => {
    base.profiles = [{ id: 'eleve-1', prenom: 'Aina', nom: 'RAKOTO', status: 'suspended', etablissement_id: 'etab-1' }]
    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    expect(reponse.status).toBe(409)
  })
})

describe('api/admin/changer-type-cours — individuel vers collectif', () => {
  beforeEach(() => {
    base.packages = [{ id: 'forfait-1', student_id: 'eleve-1', total_heures: 20, type_programme: 'individuel', clos_le: null }]
    base.session_enrollments = [
      { id: 'insc-s1', session_id: 's1', student_id: 'eleve-1', sessions: seance('s1', 'individuel') },
    ]
  })

  it('annule la séance individuelle à venir et clôt l’affectation de professeur', async () => {
    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    const corps = (await reponse.json()) as { seancesAnnulees: number; typeApres: string }

    expect(reponse.status).toBe(200)
    expect(corps.typeApres).toBe('collectif')
    expect(corps.seancesAnnulees).toBe(1)
    expect(annulerUneSeance).toHaveBeenCalledTimes(1)
    expect(journal).toContainEqual(
      expect.objectContaining({
        table: 'teacher_assignments',
        operation: 'update',
        valeurs: expect.objectContaining({ motif_changement: 'Passage en cours collectif' }),
      }),
    )
  })

  /* Une séance annulée garde son inscription — c'est elle qui dit pour qui elle avait été posée,
     et c'est elle que lit la notification envoyée juste après (même choix que retirer-professeur). */
  it('conserve l’inscription d’une séance annulée', async () => {
    await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    expect(journal.filter((o) => o.table === 'session_enrollments' && o.operation === 'delete')).toEqual([])
  })

  /* Binôme DUO (0054) : la séance appartient aussi à l'autre membre, elle reste debout. */
  it('ne touche pas à une séance encore suivie par le binôme', async () => {
    base.session_enrollments = [
      { id: 'insc-s1', session_id: 's1', student_id: 'eleve-1', sessions: seance('s1', 'individuel') },
      { id: 'insc-s1-bis', session_id: 's1', student_id: 'eleve-2', sessions: seance('s1', 'individuel') },
    ]

    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    const corps = (await reponse.json()) as { seancesAnnulees: number; inscriptionsRetirees: number }

    expect(annulerUneSeance).not.toHaveBeenCalled()
    expect(corps.seancesAnnulees).toBe(0)
    expect(corps.inscriptionsRetirees).toBe(1)
  })

  it('supprime le forfait jamais entamé ni réglé, pour ne pas gonfler les heures du suivant', async () => {
    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    const corps = (await reponse.json()) as { forfaitsSupprimes: number; forfaitsSoldes: unknown[] }

    expect(corps.forfaitsSupprimes).toBe(1)
    expect(corps.forfaitsSoldes).toEqual([])
    expect(base.packages).toEqual([])
  })

  /* Les heures ont bien été suivies : le forfait reste, soldé. Il s'additionnera au suivant,
     exactement comme lors d'une montée de classe (0146) — et le compte reste juste. */
  it('solde sans le supprimer un forfait entièrement consommé', async () => {
    parcoursMesure = { forfait: 20, consommees: 20 }

    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    const corps = (await reponse.json()) as { forfaitsSupprimes: number; forfaitsSoldes: { heures: number }[] }

    expect(corps.forfaitsSupprimes).toBe(0)
    expect(corps.forfaitsSoldes).toEqual([{ heures: 20, type: 'individuel', reglementATraiter: false }])
    expect(base.packages[0].clos_le).toBeTruthy()
  })

  it('solde et signale un forfait jamais entamé mais déjà réglé', async () => {
    base.student_payments = [{ id: 'pay-1', package_id: 'forfait-1', supprime_le: null }]

    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    const corps = (await reponse.json()) as { forfaitsSoldes: { reglementATraiter: boolean }[] }

    expect(corps.forfaitsSoldes).toEqual([{ heures: 20, type: 'individuel', reglementATraiter: true }])
    expect(base.packages).toHaveLength(1)
  })

  /* Un règlement supprimé est un soft-delete : sa ligne existe toujours et sa clé étrangère
     retient le forfait. Le compter comme absent ferait échouer le DELETE sur une erreur Postgres
     brute — exactement le piège déjà rencontré ailleurs dans l'application. */
  it('ne supprime pas un forfait retenu par un règlement supprimé', async () => {
    base.student_payments = [{ id: 'pay-1', package_id: 'forfait-1', supprime_le: '2026-11-01T00:00:00Z' }]

    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'collectif' }))
    const corps = (await reponse.json()) as { forfaitsSupprimes: number; forfaitsSoldes: { reglementATraiter: boolean }[] }

    expect(corps.forfaitsSupprimes).toBe(0)
    expect(base.packages).toHaveLength(1)
    // Rien à traiter côté argent : le règlement a justement été supprimé.
    expect(corps.forfaitsSoldes[0].reglementATraiter).toBe(false)
  })
})

describe('api/admin/changer-type-cours — collectif vers individuel', () => {
  beforeEach(() => {
    base.cohort_enrollments = [{ id: 'insc-1', student_id: 'eleve-1', cohort_id: 'vague-1', cohort_class_id: 'classe-1' }]
    base.packages = [{ id: 'forfait-c', student_id: 'eleve-1', total_heures: 32, type_programme: 'collectif', clos_le: null }]
    parcoursMesure = { forfait: 32, consommees: 0 }
  })

  it('fait sortir l’élève de sa vague', async () => {
    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'individuel' }))

    expect(reponse.status).toBe(200)
    expect(base.cohort_enrollments).toEqual([])
  })

  /* Une séance collective appartient à la CLASSE : la retirer priverait de cours tous les autres
     élèves. Seule l'inscription de celui qui part s'en va. */
  it('retire l’élève des séances de la classe sans annuler ces séances', async () => {
    base.session_enrollments = [
      { id: 'insc-s1', session_id: 's1', student_id: 'eleve-1', sessions: seance('s1', 'collectif') },
      { id: 'insc-s2', session_id: 's2', student_id: 'eleve-1', sessions: seance('s2', 'collectif') },
    ]

    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'individuel' }))
    const corps = (await reponse.json()) as { seancesAnnulees: number; inscriptionsRetirees: number }

    expect(annulerUneSeance).not.toHaveBeenCalled()
    expect(corps.seancesAnnulees).toBe(0)
    expect(corps.inscriptionsRetirees).toBe(2)
    expect(base.session_enrollments).toEqual([])
  })

  it('ne clôt aucune affectation de professeur', async () => {
    await handler(requete({ studentId: 'eleve-1', cible: 'individuel' }))
    expect(journal.filter((o) => o.table === 'teacher_assignments')).toEqual([])
  })

  it('refuse une cible inconnue', async () => {
    const reponse = await handler(requete({ studentId: 'eleve-1', cible: 'duo' }))
    expect(reponse.status).toBe(400)
  })
})
