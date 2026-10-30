import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-30 : « en fonction du type de cours souhaité, il faut récupérer les
   informations indispensables à la création d'espace personnel pour chaque type de cours.
   Enregistrer, valider et classer l'étudiant dans la bonne classe pour les cours collectifs ».

   Ce qui est verrouillé ici, et qu'aucun écran ne montre :
   - un binôme DUO = DEUX comptes mais UN SEUL forfait, porté par la première personne (0054/0059,
     « même comptage d'heures vu qu'ils seront associés ») — deux forfaits séparés était le bug
     corrigé à l'époque, il ne doit pas revenir par cette porte ;
   - le lien DUO est asymétrique : seul le secondaire porte `duo_partenaire_id` ;
   - le collectif ne crée JAMAIS de forfait ici — c'est le trigger 0071 qui le pose à
     l'inscription dans la vague, et le doubler donnerait 64 heures à l'élève ;
   - une classe pleine ne doit pas coûter la vague : on retombe sur une inscription sans classe
     plutôt que de laisser l'élève hors de toute promotion ;
   - un échec APRÈS la création du compte ne le défait pas, il est dit. */

interface Ligne {
  [cle: string]: unknown
}

let homonyme: Ligne | null = null
let comptesCrees: string[] = []
let erreurInscriptionVague: { message: string } | null = null
let erreurInscriptionSansClasse: { message: string } | null = null
let tarif: Ligne | null = null

const journal = {
  profilsMisAJour: [] as { valeurs: Ligne; id: unknown }[],
  forfaits: [] as Ligne[],
  inscriptionsVague: [] as Ligne[],
  bienvenues: [] as unknown[],
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

vi.mock('../../_lib/creerCompte.js', () => ({
  creerCompteSansEmail: vi.fn(async (_client: unknown, params: { email: string }) => {
    const id = `profil-${comptesCrees.length + 1}`
    comptesCrees.push(params.email)
    return { data: { user: { id } }, error: null }
  }),
}))

vi.mock('../../_lib/notifications.js', () => ({
  notifierBienvenueEtudiant: vi.fn(async (_client: unknown, params: unknown) => {
    journal.bienvenues.push(params)
  }),
}))

vi.mock('../../_lib/nomDuplique.js', () => ({
  trouverProfilHomonyme: vi.fn(async () => homonyme),
  messageHomonyme: () => 'Un étudiant porte déjà ce nom.',
}))

function requete(donnees: unknown) {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.maybeSingle = async () => ({ data: donnees ?? null, error: null })
  builder.then = (resoudre: (valeur: unknown) => unknown) => resoudre({ data: donnees, error: null })
  return builder
}

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return {
          update: (valeurs: Ligne) => ({
            eq: async (_colonne: string, id: unknown) => {
              journal.profilsMisAJour.push({ valeurs, id })
              return { error: null }
            },
          }),
        }
      }
      if (table === 'tarifs') return { select: () => requete(tarif) }
      if (table === 'packages') {
        return {
          insert: (valeurs: Ligne) => {
            journal.forfaits.push(valeurs)
            return { select: () => ({ maybeSingle: async () => ({ data: { id: 'forfait-1' }, error: null }) }) }
          },
        }
      }
      if (table === 'cohort_enrollments') {
        return {
          insert: async (valeurs: Ligne) => {
            journal.inscriptionsVague.push(valeurs)
            const erreur = valeurs.cohort_class_id ? erreurInscriptionVague : erreurInscriptionSansClasse
            return { error: erreur }
          },
        }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../inviter-etudiant.js')

function appel(corps: Record<string, unknown>) {
  return handler(
    new Request('https://exemple.test/api/admin/inviter-etudiant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jeton' },
      body: JSON.stringify(corps),
    }),
  )
}

const ELEVE = { prenom: 'Anaïs', nom: 'RASOA', email: 'anais@exemple.test' }

beforeEach(() => {
  homonyme = null
  comptesCrees = []
  erreurInscriptionVague = null
  erreurInscriptionSansClasse = null
  tarif = { heures: 20, prix: 400_000 }
  journal.profilsMisAJour = []
  journal.forfaits = []
  journal.inscriptionsVague = []
  journal.bienvenues = []
})

describe('inviter-etudiant', () => {
  it('individuel : un compte et le forfait de la formule retenue', async () => {
    const reponse = await appel({ ...ELEVE, typeProgramme: 'individuel', tarifId: 'tarif-20h' })

    expect(reponse.status).toBe(200)
    expect(comptesCrees).toEqual(['anais@exemple.test'])
    expect(journal.forfaits).toEqual([
      {
        etablissement_id: 'etab-1',
        student_id: 'profil-1',
        type_programme: 'individuel',
        total_heures: 20,
        montant: 400_000,
      },
    ])
  })

  it('individuel : une formule sans volume d’heures fixe ne crée pas de forfait, et le dit', async () => {
    tarif = { heures: null, prix: 0 }

    const reponse = await appel({ ...ELEVE, typeProgramme: 'individuel', tarifId: 'sur-devis' })
    const corps = (await reponse.json()) as { avertissement?: string }

    expect(journal.forfaits).toEqual([])
    expect(corps.avertissement).toContain("volume d'heures fixe")
  })

  it('DUO : deux comptes, UN SEUL forfait porté par la première personne', async () => {
    const reponse = await appel({
      ...ELEVE,
      typeProgramme: 'duo',
      tarifId: 'tarif-duo',
      partenaire: { prenom: 'Bruno', nom: 'ANDRIA', email: 'bruno@exemple.test' },
    })

    expect(reponse.status).toBe(200)
    expect(comptesCrees).toEqual(['anais@exemple.test', 'bruno@exemple.test'])
    expect(journal.forfaits).toHaveLength(1)
    expect(journal.forfaits[0]).toMatchObject({ student_id: 'profil-1', type_programme: 'duo' })
  })

  it('DUO : le lien est asymétrique, seul le secondaire pointe vers le principal', async () => {
    await appel({
      ...ELEVE,
      typeProgramme: 'duo',
      partenaire: { prenom: 'Bruno', nom: 'ANDRIA', email: 'bruno@exemple.test' },
    })

    const liens = journal.profilsMisAJour.filter((m) => 'duo_partenaire_id' in m.valeurs)
    expect(liens).toHaveLength(1)
    expect(liens[0]).toMatchObject({ id: 'profil-2', valeurs: { duo_partenaire_id: 'profil-1' } })
    // Le nom du groupe, lui, est posé des deux côtés.
    const nomsGroupe = journal.profilsMisAJour.filter((m) => m.valeurs.duo_nom_groupe === 'Anaïs/Bruno')
    expect(nomsGroupe.map((m) => m.id).sort()).toEqual(['profil-1', 'profil-2'])
  })

  it('DUO : refuse sans les informations de la seconde personne, avant tout compte créé', async () => {
    const reponse = await appel({ ...ELEVE, typeProgramme: 'duo' })

    expect(reponse.status).toBe(400)
    expect(comptesCrees).toEqual([])
  })

  it('collectif : inscrit à la vague et à la classe, sans jamais créer de forfait', async () => {
    const reponse = await appel({
      ...ELEVE,
      typeProgramme: 'collectif',
      cohortId: 'vague-1',
      cohortClassId: 'classe-beginner',
      // Un tarifId égaré ne doit pas ouvrir un second forfait : celui du collectif vient du
      // trigger 0071, posé à l'insertion ci-dessous.
      tarifId: 'tarif-20h',
    })

    expect(reponse.status).toBe(200)
    expect(journal.forfaits).toEqual([])
    expect(journal.inscriptionsVague).toEqual([
      { etablissement_id: 'etab-1', cohort_id: 'vague-1', cohort_class_id: 'classe-beginner', student_id: 'profil-1' },
    ])
  })

  it('collectif : une classe pleine ne coûte pas la vague', async () => {
    erreurInscriptionVague = { message: 'Cette classe compte déjà 7 élèves' }

    const reponse = await appel({ ...ELEVE, typeProgramme: 'collectif', cohortId: 'vague-1', cohortClassId: 'classe-pleine' })
    const corps = (await reponse.json()) as { avertissement?: string; inscritEnVague?: boolean }

    expect(reponse.status).toBe(200)
    expect(journal.inscriptionsVague.map((i) => i.cohort_class_id)).toEqual(['classe-pleine', null])
    expect(corps.inscritEnVague).toBe(true)
    expect(corps.avertissement).toContain('pas à la classe choisie')
  })

  it('collectif : refuse sans vague, avant tout compte créé', async () => {
    const reponse = await appel({ ...ELEVE, typeProgramme: 'collectif' })

    expect(reponse.status).toBe(400)
    expect(comptesCrees).toEqual([])
  })

  it('sans type de cours, se comporte comme l’invitation nue d’avant', async () => {
    const reponse = await appel(ELEVE)

    expect(reponse.status).toBe(200)
    expect(comptesCrees).toEqual(['anais@exemple.test'])
    expect(journal.forfaits).toEqual([])
    expect(journal.inscriptionsVague).toEqual([])
    expect(journal.bienvenues).toHaveLength(1)
  })

  it('refuse un homonyme avant de créer le moindre compte', async () => {
    homonyme = { id: 'deja-la' }

    const reponse = await appel({ ...ELEVE, typeProgramme: 'individuel' })

    expect(reponse.status).toBe(409)
    expect(comptesCrees).toEqual([])
  })
})
