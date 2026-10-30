import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-30 : « pour chaque classe, rajoute un bouton "Déplacer un étudiant"
   [...] toutes les informations des étudiants impactés par le déplacement se mettront à jour
   automatiquement [...] son compteur d'heures suivies repart de 0 ».

   Ce qui est verrouillé ici, et qui ne se devine d'aucun écran :
   - une classe cible pleine (7 élèves, 0074) fait refuser le LOT ENTIER, avant d'avoir déplacé
     qui que ce soit — le trigger de capacité, lui, s'arrêterait sur l'élève en trop et laisserait
     les précédents déjà déplacés ;
   - une classe cible dans une autre vague est refusée (garde-fou de changement de promotion,
     0074) ;
   - le forfait en cours est SOLDÉ et un nouveau ouvert sur la classe d'arrivée (0146), jamais
     réécrit — un forfait payé a un reçu derrière lui ;
   - AUCUNE écriture d'heures n'est touchée : le compteur repart de zéro parce que les heures se
     comptent par classe, pas parce qu'on efface quoi que ce soit ;
   - l'élève quitte les séances À VENIR de son ancienne classe et rejoint celles de la nouvelle,
     sans jamais se retrouver inscrit deux fois à la même séance. */

interface Ligne {
  [cle: string]: unknown
}

let classes: Ligne[] = []
let inscriptions: Ligne[] = []
let effectifCible = 0
let seancesParClasse: Record<string, Ligne[]> = {}
let forfaitEnCours: Ligne | null = null
let inscriptionsSeancesExistantes: Ligne[] = []

const journal = {
  classesMisesAJour: [] as { valeurs: Ligne; ids: unknown }[],
  forfaitsSoldes: [] as { valeurs: Ligne; id: unknown }[],
  forfaitsOuverts: [] as Ligne[],
  inscriptionsSupprimees: [] as Record<string, unknown>[],
  inscriptionsInserees: [] as Ligne[][],
  tablesEcrites: [] as string[],
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

const notifierAdminsMouvementPlanning = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/notifications.js', () => ({
  formaterDateSeance: (iso: string) => iso,
  notifierAdminsMouvementPlanning: (...args: unknown[]) => notifierAdminsMouvementPlanning(...args),
}))

const synchroniserInvitesVisio = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../../_lib/synchroniserVisio.js', () => ({
  synchroniserInvitesVisio: (...args: unknown[]) => synchroniserInvitesVisio(...args),
}))

vi.mock('../../_lib/synchro.js', () => ({ signalerSynchro: vi.fn(async () => {}) }))

/* Le parcours mesuré par la règle partagée (`mesurerParcours`) : ce test ne rejoue pas son
   calcul, il vérifie que la route REFUSE un forfait non terminé en mode ajout, et qu'elle ne
   pose jamais cette condition en mode déplacement. */
let parcoursMesure = { forfait: 32 as number | null, consommees: 32 }
vi.mock('../../_lib/finDeForfait.js', () => ({
  mesurerParcours: vi.fn(async (..._args: unknown[]) => parcoursMesure),
}))

/* Faux client Supabase : un constructeur de requête chaînable qui retient les filtres posés et
   se résout en `data` quand on l'attend. Reproduit postgrest-js juste assez pour que la route
   s'exécute telle quelle — même parti pris que retirer-professeur.test.ts. */
function requete(donnees: unknown, filtres: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {}
  const poser = (colonne: string, valeur: unknown) => {
    filtres[colonne] = valeur
    return builder
  }
  builder.select = () => builder
  builder.eq = poser
  builder.in = (colonne: string, valeurs: unknown) => poser(`${colonne}_in`, valeurs)
  builder.is = (colonne: string, valeur: unknown) => poser(`${colonne}_is`, valeur)
  builder.gte = (colonne: string, valeur: unknown) => poser(`${colonne}_min`, valeur)
  builder.order = () => builder
  builder.limit = () => builder
  builder.maybeSingle = async () => ({ data: donnees ?? null, error: null })
  builder.single = async () => ({ data: donnees ?? null, error: donnees ? null : { message: 'introuvable' } })
  builder.then = (resoudre: (valeur: unknown) => unknown) => resoudre({ data: donnees, error: null })
  return builder
}

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'cohort_classes') return { select: () => requete(classes) }

      if (table === 'cohort_enrollments') {
        return {
          select: (_colonnes?: string, options?: { head?: boolean }) =>
            options?.head
              ? { eq: () => Promise.resolve({ count: effectifCible, error: null }) }
              : requete(inscriptions),
          update: (valeurs: Ligne) => ({
            in: async (_colonne: string, ids: unknown) => {
              journal.classesMisesAJour.push({ valeurs, ids })
              journal.tablesEcrites.push('cohort_enrollments')
              return { error: null }
            },
          }),
        }
      }

      if (table === 'cohorts') return { select: () => requete({ heures_forfait: 32 }) }
      if (table === 'etablissements') return { select: () => requete({ heures_forfait_collectif: 32 }) }
      if (table === 'tarifs') return { select: () => requete([{ prix: 150_000, heures: 32 }]) }

      if (table === 'sessions') {
        /* `.eq('cohort_class_id', x)` pour la classe d'arrivée, `.in('cohort_class_id', [...])`
           pour les classes quittées (plusieurs en mode ajout) : les deux renvoient les séances
           du jeu de test. Les filtres restants (statut, debut) ne changent rien ici — chaque
           classe n'y porte que des séances à venir encore planifiées. */
        const filtres: Record<string, unknown> = {}
        const builder = requete([], filtres) as Record<string, unknown>
        const pour = (ids: string[]) => requete(ids.flatMap((id) => seancesParClasse[id] ?? []), filtres)
        builder.eq = (colonne: string, valeur: unknown) =>
          colonne === 'cohort_class_id' ? pour([String(valeur)]) : builder
        builder.in = (colonne: string, valeurs: unknown) =>
          colonne === 'cohort_class_id' ? pour((valeurs as string[]) ?? []) : builder
        return { select: () => builder }
      }

      if (table === 'packages') {
        return {
          select: () => requete(forfaitEnCours),
          update: (valeurs: Ligne) => ({
            eq: async (_colonne: string, id: unknown) => {
              journal.forfaitsSoldes.push({ valeurs, id })
              journal.tablesEcrites.push('packages')
              return { error: null }
            },
          }),
          insert: async (valeurs: Ligne) => {
            journal.forfaitsOuverts.push(valeurs)
            journal.tablesEcrites.push('packages')
            return { error: null }
          },
        }
      }

      if (table === 'session_enrollments') {
        return {
          select: () => requete(inscriptionsSeancesExistantes),
          delete: () => ({
            in: (colonne: string, valeurs: unknown) => ({
              in: async (colonne2: string, valeurs2: unknown) => {
                journal.inscriptionsSupprimees.push({ [colonne]: valeurs, [colonne2]: valeurs2 })
                journal.tablesEcrites.push('session_enrollments')
                return { error: null }
              },
            }),
          }),
          insert: async (lignes: Ligne[]) => {
            journal.inscriptionsInserees.push(lignes)
            journal.tablesEcrites.push('session_enrollments')
            return { error: null }
          },
        }
      }

      /* `hour_ledger` n'a volontairement aucun cas ici : la route ne doit JAMAIS y toucher.
         Une écriture d'heures ferait échouer ce test, ce qui est exactement le but. */
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../deplacer-etudiants-classe.js')

function appel(corps: Record<string, unknown>) {
  return handler(
    new Request('https://exemple.test/api/admin/deplacer-etudiants-classe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jeton' },
      body: JSON.stringify(corps),
    }),
  )
}

beforeEach(() => {
  classes = [
    { id: 'classe-beginner', cohort_id: 'vague-1', etablissement_id: 'etab-1', teacher_id: 'prof-1' },
    { id: 'classe-intermediate', cohort_id: 'vague-1', etablissement_id: 'etab-1', teacher_id: 'prof-2' },
  ]
  inscriptions = [{ id: 'insc-1', student_id: 'eleve-1', cohort_id: 'vague-1', cohort_class_id: 'classe-beginner' }]
  effectifCible = 2
  seancesParClasse = {
    'classe-beginner': [{ id: 'seance-b1', debut: '2026-11-04T16:00:00Z' }],
    'classe-intermediate': [{ id: 'seance-i1', debut: '2026-11-05T16:30:00Z' }],
  }
  forfaitEnCours = { id: 'forfait-1', cohort_class_id: null }
  inscriptionsSeancesExistantes = []
  parcoursMesure = { forfait: 32, consommees: 32 }
  journal.classesMisesAJour = []
  journal.forfaitsSoldes = []
  journal.forfaitsOuverts = []
  journal.inscriptionsSupprimees = []
  journal.inscriptionsInserees = []
  journal.tablesEcrites = []
  notifierAdminsMouvementPlanning.mockClear()
  synchroniserInvitesVisio.mockClear()
})

describe('deplacer-etudiants-classe', () => {
  it('déplace l’élève, solde son forfait et en ouvre un neuf sur la classe d’arrivée', async () => {
    const reponse = await appel({
      classeSourceId: 'classe-beginner',
      classeCibleId: 'classe-intermediate',
      studentIds: ['eleve-1'],
    })

    expect(reponse.status).toBe(200)
    expect(await reponse.json()).toMatchObject({ ok: true, deplaces: 1, forfaitsOuverts: 1 })

    expect(journal.classesMisesAJour).toEqual([{ valeurs: { cohort_class_id: 'classe-intermediate', cohort_id: 'vague-1' }, ids: ['insc-1'] }])

    // Soldé, pas réécrit : seuls `clos_le` et la classe qu'il couvrait sont posés.
    expect(journal.forfaitsSoldes).toHaveLength(1)
    expect(journal.forfaitsSoldes[0].id).toBe('forfait-1')
    expect(journal.forfaitsSoldes[0].valeurs.cohort_class_id).toBe('classe-beginner')
    expect(journal.forfaitsSoldes[0].valeurs.clos_le).toBeTruthy()

    // Le forfait neuf porte la classe d'arrivée et le montant de la grille tarifaire.
    expect(journal.forfaitsOuverts).toEqual([
      {
        etablissement_id: 'etab-1',
        student_id: 'eleve-1',
        type_programme: 'collectif',
        total_heures: 32,
        montant: 150_000,
        cohort_class_id: 'classe-intermediate',
      },
    ])
  })

  it('fait suivre le planning : sorti des séances à venir de l’ancienne classe, inscrit à celles de la nouvelle', async () => {
    await appel({ classeSourceId: 'classe-beginner', classeCibleId: 'classe-intermediate', studentIds: ['eleve-1'] })

    expect(journal.inscriptionsSupprimees).toEqual([{ session_id: ['seance-b1'], student_id: ['eleve-1'] }])
    expect(journal.inscriptionsInserees).toEqual([
      [{ session_id: 'seance-i1', student_id: 'eleve-1', teacher_assignment_id: null, invitation_statut: 'en_attente' }],
    ])
  })

  it('n’inscrit pas deux fois un élève déjà convié à une séance de la classe d’arrivée', async () => {
    inscriptionsSeancesExistantes = [{ session_id: 'seance-i1', student_id: 'eleve-1' }]

    await appel({ classeSourceId: 'classe-beginner', classeCibleId: 'classe-intermediate', studentIds: ['eleve-1'] })

    expect(journal.inscriptionsInserees).toEqual([])
  })

  it('ne touche JAMAIS aux écritures d’heures : le compteur repart de zéro par la portée, pas par un effacement', async () => {
    await appel({ classeSourceId: 'classe-beginner', classeCibleId: 'classe-intermediate', studentIds: ['eleve-1'] })

    expect(journal.tablesEcrites).not.toContain('hour_ledger')
  })

  it('refuse le lot entier quand la classe d’arrivée n’a pas assez de places, sans rien déplacer', async () => {
    effectifCible = 6
    inscriptions = [
      { id: 'insc-1', student_id: 'eleve-1', cohort_id: 'vague-1', cohort_class_id: 'classe-beginner' },
      { id: 'insc-2', student_id: 'eleve-2', cohort_id: 'vague-1', cohort_class_id: 'classe-beginner' },
    ]

    const reponse = await appel({
      classeSourceId: 'classe-beginner',
      classeCibleId: 'classe-intermediate',
      studentIds: ['eleve-1', 'eleve-2'],
    })

    expect(reponse.status).toBe(409)
    expect(((await reponse.json()) as { error?: string }).error).toContain('1 élève de plus')
    expect(journal.classesMisesAJour).toEqual([])
    expect(journal.forfaitsOuverts).toEqual([])
  })

  it('refuse une classe d’arrivée située dans une autre vague', async () => {
    classes = [
      { id: 'classe-beginner', cohort_id: 'vague-1', etablissement_id: 'etab-1', teacher_id: 'prof-1' },
      { id: 'classe-intermediate', cohort_id: 'vague-2', etablissement_id: 'etab-1', teacher_id: 'prof-2' },
    ]

    const reponse = await appel({
      classeSourceId: 'classe-beginner',
      classeCibleId: 'classe-intermediate',
      studentIds: ['eleve-1'],
    })

    expect(reponse.status).toBe(409)
    expect(((await reponse.json()) as { error?: string }).error).toContain('autre vague')
    expect(journal.classesMisesAJour).toEqual([])
  })

  /* Mode AJOUT — zone de recherche du formulaire « Nouvelle classe », demande client du
     2026-10-30 : « à condition que l'étudiant ait déjà consommé toutes ses heures de forfait ET
     que l'étudiant soit déjà inscrit en cours collectif ». */
  describe('ajout à une nouvelle classe (sans classe de départ)', () => {
    it('accepte un élève venu d’une AUTRE vague dont le forfait est terminé, et le rattache à la nouvelle vague', async () => {
      inscriptions = [{ id: 'insc-9', student_id: 'eleve-9', cohort_id: 'vague-0', cohort_class_id: 'classe-ancienne' }]
      seancesParClasse['classe-ancienne'] = []

      const reponse = await appel({ classeCibleId: 'classe-intermediate', studentIds: ['eleve-9'] })

      expect(reponse.status).toBe(200)
      expect(journal.classesMisesAJour).toEqual([
        { valeurs: { cohort_class_id: 'classe-intermediate', cohort_id: 'vague-1' }, ids: ['insc-9'] },
      ])
      // Même règle de forfait que le déplacement : l'ancien soldé, un neuf sur la classe rejointe.
      expect(journal.forfaitsSoldes).toHaveLength(1)
      expect(journal.forfaitsOuverts[0]).toMatchObject({ cohort_class_id: 'classe-intermediate', total_heures: 32 })
    })

    it('refuse un élève dont le forfait n’est pas entièrement consommé', async () => {
      inscriptions = [{ id: 'insc-9', student_id: 'eleve-9', cohort_id: 'vague-0', cohort_class_id: 'classe-ancienne' }]
      parcoursMesure = { forfait: 32, consommees: 18 }

      const reponse = await appel({ classeCibleId: 'classe-intermediate', studentIds: ['eleve-9'] })

      expect(reponse.status).toBe(409)
      expect(((await reponse.json()) as { error?: string }).error).toContain('consommé toutes les heures')
      expect(journal.classesMisesAJour).toEqual([])
      expect(journal.forfaitsOuverts).toEqual([])
    })

    it('refuse un élève qui n’est inscrit à aucun cours collectif', async () => {
      inscriptions = []

      const reponse = await appel({ classeCibleId: 'classe-intermediate', studentIds: ['eleve-individuel'] })

      expect(reponse.status).toBe(409)
      expect(((await reponse.json()) as { error?: string }).error).toContain('cours collectif')
      expect(journal.classesMisesAJour).toEqual([])
    })

    it('ne pose pas la condition de forfait en mode déplacement', async () => {
      parcoursMesure = { forfait: 32, consommees: 4 }

      const reponse = await appel({
        classeSourceId: 'classe-beginner',
        classeCibleId: 'classe-intermediate',
        studentIds: ['eleve-1'],
      })

      expect(reponse.status).toBe(200)
      expect(journal.classesMisesAJour).toHaveLength(1)
    })
  })

  it('refuse un élève qui n’est pas inscrit dans la classe de départ', async () => {
    inscriptions = []

    const reponse = await appel({
      classeSourceId: 'classe-beginner',
      classeCibleId: 'classe-intermediate',
      studentIds: ['eleve-inconnu'],
    })

    expect(reponse.status).toBe(409)
    expect(journal.classesMisesAJour).toEqual([])
  })
})
