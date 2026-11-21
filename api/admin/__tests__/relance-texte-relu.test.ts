import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-11-21 : relire — et retoucher — le message d'une relance avant qu'il ne
   parte. Côté serveur, tout tient à une règle : un texte relu part TEL QUEL.

   Le resubstituer serait le piège évident. Les modèles sont écrits avec des `{{variables}}`
   (0091) ; si la route repassait le texte retouché dans la substitution, une phrase réécrite à la
   main pourrait se voir amputée — `preparerEmail` RETIRE les lignes dont toutes les variables
   sont vides. L'administration verrait partir autre chose que ce qu'elle a validé.

   Ce fichier garde les deux chemins : avec texte relu, sans texte relu. */

const envoyerEmail = vi.fn(async (..._args: unknown[]) => ({ envoye: true }))
vi.mock('../../_lib/email.js', () => ({
  envoyerEmail: (...args: unknown[]) => envoyerEmail(...args),
  modeleRelanceProspect: () => '<p>secours</p>',
}))

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

const relancesEcrites: Record<string, unknown>[] = []

/* Constantes de la maison et créneaux de test de positionnement : pilotables, pour distinguer
   « valeur saisie à la main » et « valeur déduite des créneaux ». */
let variablesEmail: { cle: string; valeur: string | null }[] = []
let creneauxTest: { debut: string }[] = []

/* Le modèle enregistré porte une variable que le dossier ne renseigne pas : c'est exactement la
   ligne que `preparerEmail` retire, et donc le meilleur révélateur d'une resubstitution. */
const MODELE = {
  objet: 'On vous attend, {{prenom}} !',
  corps: 'Bonjour {{prenom}},\n- Votre formule : {{formule_choisie}}\nÀ très vite.',
  actif: true,
  piece_jointe_document_id: null,
}

/* Le vrai modèle 1.2 écrit cette phrase-là, et c'est elle qui partait trouée : « le test oral à
   8h l'un de ces samedis : , , , . » */
const MODELE_AVEC_SAMEDIS = {
  objet: 'Votre projet d’anglais',
  corps: 'Bonjour {{prenom}},\nLe test oral à 8h l’un de ces samedis : {{samedi_1}}, {{samedi_2}}.\nÀ bientôt.',
  actif: true,
  piece_jointe_document_id: null,
}
let modeleUtilise = MODELE

function requete(donnees: unknown) {
  const builder: Record<string, unknown> = {}
  for (const methode of ['select', 'eq', 'gte', 'order', 'limit', 'is', 'in']) builder[methode] = () => builder
  builder.maybeSingle = () => Promise.resolve({ data: donnees, error: null })
  builder.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: donnees, error: null }).then(r)
  return builder
}

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'prospects') {
        return requete({ id: 'prospect-1', etablissement_id: 'etab-1', prenom: 'Wadjeedah', email: 'w@exemple.test', statut: 'diagnostic_realise', type_programme: 'individuel', tarif_choisi_id: null })
      }
      if (table === 'email_templates') return requete(modeleUtilise)
      if (table === 'etablissements') return requete({ nom: 'Hari Online Club', telephone: '+261', email: 'admin@exemple.test' })
      if (table === 'cohorts') return requete(null)
      if (table === 'tarifs') return requete(null)
      if (table === 'email_variables') return requete(variablesEmail)
      if (table === 'creneaux_test_positionnement') return requete(creneauxTest)
      if (table === 'relances') {
        return { insert: async (valeurs: Record<string, unknown>) => { relancesEcrites.push(valeurs); return { error: null } } }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { libelleFormule } = await import('../../_lib/relance.js')
const { default: handler } = await import('../relancer-prospect.js')

function appel(corps: Record<string, unknown>) {
  return handler(
    new Request('https://exemple.test/api/admin/relancer-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jeton' },
      body: JSON.stringify(corps),
    }),
  )
}

const dernierEnvoi = () => envoyerEmail.mock.calls[0][0] as { sujet: string; html: string; destinataire: string }

beforeEach(() => {
  envoyerEmail.mockClear()
  relancesEcrites.length = 0
  variablesEmail = []
  creneauxTest = []
  modeleUtilise = MODELE
})

/* Vu a l'ecran le 2026-11-21 en relisant une relance de reglement : le message annoncait
   « VOTRE FORMULE / 50h — 50 h ». Les tarifs de HOC portent deja leur volume dans leur TITRE
   (les quinze tarifs individuels en base s'appellent « 1h », « 20h », « 50h »…), et recoller le
   nombre derriere produisait ce doublon. Aucune relance 1.4 n'etait encore partie — personne ne
   l'a recu. */
describe('libelle d’une formule', () => {
  it('n’ajoute pas le volume quand le titre le dit deja', () => {
    expect(libelleFormule({ titre: '50h', heures: 50 })).toBe('50h')
    expect(libelleFormule({ titre: '1h', heures: 1 })).toBe('1h')
    expect(libelleFormule({ titre: '20 H', heures: 20 })).toBe('20 H')
  })

  it('l’ajoute quand le titre n’en parle pas', () => {
    expect(libelleFormule({ titre: 'Formule intensive', heures: 40 })).toBe('Formule intensive — 40 h')
  })

  /* Un tarif collectif n'a pas d'heures : son titre suffit, et rien ne doit s'y coller. */
  it('laisse un tarif sans heures tel quel', () => {
    expect(libelleFormule({ titre: 'Intermediate', heures: null })).toBe('Intermediate')
  })

  /* « 150h » contient « 50h » : sans la garde sur le chiffre precedent, un tarif de 50 h nomme
     « 150h » passerait pour deja complet. */
  it('ne confond pas un volume avec la fin d’un autre nombre', () => {
    expect(libelleFormule({ titre: '150h', heures: 50 })).toBe('150h — 50 h')
  })
})

/* Constat du 2026-11-21, en relisant une relance : les quatre dates de test oral (`samedi_1` a
   `samedi_4`, 0093) etaient VIDES en production, et le modele 1.2 partait avec « le test oral a
   8h l'un de ces samedis : , , , . » — la ligne ne tombe pas, puisqu'elle porte du texte autour
   de ses variables.

   Saisies a la main, ces dates etaient condamnees a devenir fausses : elles changent chaque
   semaine, et personne ne pense a rouvrir un ecran de reglages pour les decaler. Elles se
   remplissent maintenant depuis les creneaux de test reellement programmes. */
describe('dates de test oral', () => {
  it('reprend les prochains creneaux programmes quand les dates ne sont pas saisies', async () => {
    modeleUtilise = MODELE_AVEC_SAMEDIS
    creneauxTest = [{ debut: '2026-11-28T05:00:00Z' }, { debut: '2026-12-05T05:00:00Z' }]

    await appel({ prospectId: 'prospect-1', motif: 'forfait_a_choisir' })

    expect(dernierEnvoi().html).toContain('28 novembre')
    expect(dernierEnvoi().html).toContain('5 décembre')
    // Et surtout : plus de « : , . » a la place des dates.
    expect(dernierEnvoi().html).not.toMatch(/samedis\s*:\s*,/)
  })

  /* Une date saisie volontairement l'emporte : la deduction comble un manque, elle ne decide
     pas a la place de l'administration. */
  it('ne remplace jamais une date saisie a la main', async () => {
    modeleUtilise = MODELE_AVEC_SAMEDIS
    variablesEmail = [{ cle: 'samedi_1', valeur: 'le 24 décembre, exceptionnellement' }]
    creneauxTest = [{ debut: '2026-11-28T05:00:00Z' }, { debut: '2026-12-05T05:00:00Z' }]

    await appel({ prospectId: 'prospect-1', motif: 'forfait_a_choisir' })

    expect(dernierEnvoi().html).toContain('24 décembre, exceptionnellement')
    expect(dernierEnvoi().html).not.toContain('28 novembre')
  })
})

describe('relance d’un prospect — texte relu à l’écran', () => {
  it('envoie le texte relu tel quel, sans y resubstituer quoi que ce soit', async () => {
    const reponse = await appel({
      prospectId: 'prospect-1',
      motif: 'forfait_a_choisir',
      objet: 'Votre place vous attend',
      corpsEmail: 'Bonjour Wadjeedah,\nAppelez-nous quand vous voulez.\nIci {{une_variable}} reste écrite.',
    })

    expect(reponse.status).toBe(200)
    expect(dernierEnvoi().sujet).toBe('Votre place vous attend')
    expect(dernierEnvoi().html).toContain('Appelez-nous quand vous voulez.')
    /* La ligne à variable inconnue SURVIT : preuve qu'aucune substitution n'est repassée dessus.
       Si elle avait lieu, `preparerEmail` retirerait cette ligne entière. */
    expect(dernierEnvoi().html).toContain('{{une_variable}}')
    expect(dernierEnvoi().destinataire).toEqual(['w@exemple.test'])
  })

  it('compose depuis le modèle quand aucun texte n’est fourni', async () => {
    const reponse = await appel({ prospectId: 'prospect-1', motif: 'forfait_a_choisir' })

    expect(reponse.status).toBe(200)
    expect(dernierEnvoi().sujet).toBe('On vous attend, Wadjeedah !')
    expect(dernierEnvoi().html).toContain('Bonjour Wadjeedah')
    /* `formule_choisie` n'a pas de valeur ici : la ligne qui ne vit que par elle disparaît,
       comportement d'origine qu'il ne faut pas perdre. */
    expect(dernierEnvoi().html).not.toContain('Votre formule')
  })

  /* Un objet ou un corps vide ne doit pas faire partir un message amputé : la route retombe
     alors sur le modèle, plutôt que d'envoyer du vide. */
  it('ignore un texte incomplet et revient au modèle', async () => {
    const reponse = await appel({ prospectId: 'prospect-1', motif: 'forfait_a_choisir', objet: '   ', corpsEmail: 'Un corps sans objet.' })

    expect(reponse.status).toBe(200)
    expect(dernierEnvoi().sujet).toBe('On vous attend, Wadjeedah !')
  })

  /* La trace reste écrite dans tous les cas : c'est elle qui dit à l'administration qu'elle a
     déjà relancé, et combien de fois. */
  it('inscrit la relance dans l’historique, texte relu ou non', async () => {
    await appel({ prospectId: 'prospect-1', motif: 'paiement_a_regler', objet: 'Objet relu', corpsEmail: 'Corps relu' })

    expect(relancesEcrites).toHaveLength(1)
    expect(relancesEcrites[0]).toMatchObject({
      prospect_id: 'prospect-1',
      motif: 'paiement_a_regler',
      destinataire_email: 'w@exemple.test',
      succes: true,
      modele_reference: '1.4',
    })
  })
})
