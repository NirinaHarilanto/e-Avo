import { describe, expect, it } from 'vitest'
import { deduireSource, preparerVariables, substituerVariablesDuo } from '../contrats'
import type { Database } from '../../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Anniversaire tombant aujourd'hui, `annees` plus tôt : l'âge attendu est exactement `annees`,
   quel que soit le jour où le test s'exécute (pas d'effet de bord lié à la date du jour). */
function dateNaissanceIlYA(annees: number): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - annees)
  return date.toISOString().slice(0, 10)
}

const etudiant: Profile = {
  id: 'p1',
  etablissement_id: 'e1',
  prospect_id: null,
  role: 'etudiant',
  status: 'approved',
  nom: 'Rakoto',
  prenom: 'Miora',
  email: 'miora@example.mg',
  telephone: '+261 34 00 000 00',
  whatsapp: null,
  adresse: 'Lot II M 12, Antananarivo',
  ville: 'Antananarivo',
  date_naissance: null,
  lieu_naissance: null,
  taux_horaire: null,
  signature_path: null,
  mot_de_passe_defini: true,
  duo_partenaire_id: null,
  duo_nom_groupe: null,
  motif_pause: null,
  pause_le: null,
  pause_par: null,
  created_at: '2026-01-01T00:00:00Z',
}

const professeur: Profile = {
  ...etudiant,
  id: 'p2',
  role: 'professeur',
  nom: 'Randria',
  prenom: 'Fanja',
  email: 'fanja@example.mg',
  taux_horaire: 25000,
}

const etablissement: Etablissement = {
  id: 'e1',
  nom: 'Hari Online Club',
  slug: 'hari-online-club',
  specialite: 'Langues',
  couleur_accent: null,
  logo_url: null,
  calendly_url: null,
  heures_forfait_collectif: 32,
  relance_echeance_jours: 3,
  created_at: '2026-01-01T00:00:00Z',
}

/* Les libellés ci-dessous sont ceux du modèle réellement utilisé par l'établissement : ils ne
   suivent aucune convention de nommage, ce qui avait mis en échec une première version du
   pré-remplissage fondée sur la seule clé de la variable. */
describe('deduireSource', () => {
  it('reconnaît les champs de la personne concernée', () => {
    expect(deduireSource('nom_complet_etudiant', "Nom complet de l'étudiant")).toBe('nom_complet')
    expect(deduireSource('adresse_etudiant', "Adresse de l'étudiant")).toBe('adresse')
    expect(deduireSource('email_professeur', 'E-mail du professeur')).toBe('email')
    expect(deduireSource('tel', 'Téléphone du professeur')).toBe('telephone')
  })

  it('accepte une clé nue, qui ne peut désigner que la partie au contrat', () => {
    expect(deduireSource('adresse', 'Adresse')).toBe('adresse')
    expect(deduireSource('nom', 'Nom')).toBe('nom')
  })

  it("n'attribue pas les données du destinataire à un tiers nommé", () => {
    expect(deduireSource('nom_mediateur', 'Nom du médiateur de la consommation')).toBeUndefined()
    expect(deduireSource('coordonnees_mediateur', 'Coordonnées du médiateur (adresse ou site web)')).toBeUndefined()
    expect(
      deduireSource('mention_mineur', "Si l'étudiant est mineur, coller : « Représenté(e) par [Nom], en qualité de représentant légal, qui consent à la présente inscription »"),
    ).toBeUndefined()
  })

  it('distingue la date de signature des autres dates du contrat', () => {
    expect(deduireSource('date_signature', 'Date de signature')).toBe('date_du_jour')
    // La date de naissance se remplit désormais seule (elle est sur la fiche depuis la
    // migration 0034) — seule une date sans source connue (début de cours, non stockée) reste
    // manuelle.
    expect(deduireSource('date_naissance_etudiant', "Date de naissance de l'étudiant")).toBe('date_naissance')
    // Idem pour la date de début des cours : dérivée de l'affectation professeur ou de la
    // vague en cours (voir `date_debut_programme`, résolu via le contexte de programme).
    expect(deduireSource('date_debut', 'Date de début des cours')).toBe('date_debut_programme')
    // « Ville de signature » ne doit pas hériter de la ville de résidence de l'étudiant : ce
    // n'est pas la même donnée (le mot « signature » bloque volontairement la déduction).
    expect(deduireSource('ville_signature', 'Ville de signature')).toBeUndefined()
  })

  it("rattache les champs d'établissement à l'établissement", () => {
    expect(deduireSource('nom_etablissement', "Nom de l'établissement")).toBe('etablissement_nom')
  })

  it('rattache un « prestataire » explicitement nommé professeur/étudiant à la personne, pas à l’établissement', () => {
    // Bug signalé par le client le 2026-09-16 : {{nom_prestataire}} du modèle professeur
    // ("Nom complet du professeur") se remplissait avec le nom de l'établissement, "prestataire"
    // étant traité comme un synonyme d'établissement sans regarder que le libellé nomme
    // explicitement le professeur.
    expect(deduireSource('nom_prestataire', 'Nom complet du professeur')).toBe('nom_complet')
    expect(deduireSource('adresse_prestataire', 'Adresse du professeur')).toBe('adresse')
    // Sans mention de la personne, "prestataire" désigne toujours l'établissement — inchangé.
    expect(deduireSource('nom_prestataire', 'Nom du prestataire')).toBe('etablissement_nom')
  })
})

describe('preparerVariables', () => {
  const corps = 'Entre {{nom_etablissement}} et {{nom_complet_etudiant}}, domicilié {{adresse_etudiant}}, né le {{date_naissance_etudiant}}. Modalités : {{modalites_paiement}}.'
  const declarees = [
    { cle: 'nom_etablissement', label: "Nom de l'établissement" },
    { cle: 'nom_complet_etudiant', label: "Nom complet de l'étudiant" },
    { cle: 'adresse_etudiant', label: "Adresse de l'étudiant" },
    { cle: 'date_naissance_etudiant', label: "Date de naissance de l'étudiant" },
    { cle: 'modalites_paiement', label: 'Modalités de paiement' },
  ]

  it('remplit seules les variables adossées à une fiche, sans paramétrage du modèle', () => {
    const resolues = preparerVariables(corps, declarees, etudiant, etablissement)
    const parCle = Object.fromEntries(resolues.map((v) => [v.cle, v]))

    expect(parCle.nom_complet_etudiant.valeurAuto).toBe('Miora Rakoto')
    expect(parCle.adresse_etudiant.valeurAuto).toBe('Lot II M 12, Antananarivo')
    expect(parCle.nom_etablissement.valeurAuto).toBe('Hari Online Club')
  })

  it('laisse en saisie ce quaucune fiche ne connaît, avec une valeur courante proposée', () => {
    const resolues = preparerVariables(corps, declarees, etudiant, etablissement)
    const parCle = Object.fromEntries(resolues.map((v) => [v.cle, v]))

    expect(parCle.date_naissance_etudiant.valeurAuto).toBeUndefined()
    expect(parCle.modalites_paiement.valeurAuto).toBeUndefined()
    expect(parCle.modalites_paiement.defaut).toMatch(/paiement/i)
  })

  it('fait primer une source explicite du modèle sur la déduction', () => {
    const resolues = preparerVariables('{{intitule}}', [{ cle: 'intitule', label: 'Intitulé', source: 'prenom' }], etudiant, etablissement)
    expect(resolues[0].valeurAuto).toBe('Miora')
  })

  it("respecte le choix explicite d'une saisie manuelle", () => {
    const resolues = preparerVariables('{{adresse}}', [{ cle: 'adresse', label: 'Adresse', source: 'manuel' }], etudiant, etablissement)
    expect(resolues[0].valeurAuto).toBeUndefined()
  })

  it('retombe sur la saisie quand la donnée est absente de la fiche', () => {
    const resolues = preparerVariables('{{taux_horaire}}', [{ cle: 'taux_horaire', label: 'Taux horaire' }], etudiant, etablissement)
    expect(resolues[0].valeurAuto).toBeUndefined()
  })
})

describe('preparerVariables — âge et clause de minorité', () => {
  const modele = [
    { cle: 'age_etudiant', label: "Âge de l'étudiant" },
    { cle: 'mention_mineur', label: "Si l'étudiant est mineur, coller : « Représenté(e) par [Nom]… »" },
  ]
  const corps = '{{age_etudiant}} {{mention_mineur}}'

  it("calcule l'âge à partir de la date de naissance", () => {
    const majeur = { ...etudiant, date_naissance: dateNaissanceIlYA(20) }
    const resolues = preparerVariables(corps, modele, majeur, etablissement)
    expect(resolues.find((v) => v.cle === 'age_etudiant')?.valeurAuto).toBe('20')
  })

  it('un étudiant majeur ne demande plus la clause de minorité — elle se vide toute seule', () => {
    const majeur = { ...etudiant, date_naissance: dateNaissanceIlYA(20) }
    const resolues = preparerVariables(corps, modele, majeur, etablissement)
    const clause = resolues.find((v) => v.cle === 'mention_mineur')
    expect(clause?.valeurAuto).toBe('')
    expect(clause?.defaut).toBeUndefined()
  })

  it('un étudiant mineur reçoit une suggestion à vérifier plutôt qu’un remplissage silencieux', () => {
    const mineur = { ...etudiant, date_naissance: dateNaissanceIlYA(15) }
    const resolues = preparerVariables(corps, modele, mineur, etablissement)
    const clause = resolues.find((v) => v.cle === 'mention_mineur')
    // Le nom du représentant légal n'est connu d'aucune fiche : pas de valeurAuto (une mention à
    // portée juridique reste soumise à relecture), seulement une suggestion de départ éditable.
    expect(clause?.valeurAuto).toBeUndefined()
    expect(clause?.defaut).toMatch(/représentant légal/i)
  })

  it("sans date de naissance connue, la clause de minorité reste entièrement manuelle (comportement inchangé)", () => {
    const resolues = preparerVariables(corps, modele, etudiant, etablissement)
    const clause = resolues.find((v) => v.cle === 'mention_mineur')
    expect(clause?.valeurAuto).toBeUndefined()
    expect(clause?.defaut).toBeUndefined()
  })
})

describe('preparerVariables — contexte de programme', () => {
  it('remplit les champs de programme étudiant depuis le dossier pédagogique', () => {
    const modele = [
      { cle: 'langue', label: 'Langue visée' },
      { cle: 'type_prog', label: 'Type de programme' },
      { cle: 'heures', label: "Nombre d'heures du programme" },
      { cle: 'debut', label: 'Date de début des cours' },
      { cle: 'echeance', label: 'Échéance du programme' },
      { cle: 'rythme', label: 'Rythme hebdomadaire' },
    ]
    const corps = '{{langue}} {{type_prog}} {{heures}} {{debut}} {{echeance}} {{rythme}}'
    const resolues = preparerVariables(corps, modele, etudiant, etablissement, {
      langueProgramme: 'Anglais',
      typeProgrammeLabel: 'Individuel',
      heuresProgramme: 40,
      dateDebutProgramme: '2026-01-15',
      dateEcheanceProgramme: '2026-07-15',
      rythmeProgramme: '2 séances par semaine',
    })
    const parCle = Object.fromEntries(resolues.map((v) => [v.cle, v]))

    expect(parCle.langue.valeurAuto).toBe('Anglais')
    expect(parCle.type_prog.valeurAuto).toBe('Individuel')
    expect(parCle.heures.valeurAuto).toBe('40')
    expect(parCle.debut.valeurAuto).toBe(new Date('2026-01-15').toLocaleDateString('fr-FR'))
    expect(parCle.echeance.valeurAuto).toBe(new Date('2026-07-15').toLocaleDateString('fr-FR'))
    expect(parCle.rythme.valeurAuto).toBe('2 séances par semaine')
  })

  it('remplit le prix du contrat avec le montant figé sur le forfait', () => {
    // « Prix total (Ar) » est le libellé réellement utilisé dans le modèle de l'établissement.
    const resolues = preparerVariables('{{prix}}', [{ cle: 'prix', label: 'Prix total (Ar)' }], etudiant, etablissement, {
      montantProgramme: 1200000,
    })
    // Séparateur de milliers laissé à toLocaleString : selon la version d'ICU c'est une espace
    // fine insécable (U+202F) ou une espace ordinaire — les deux conviennent à l'affichage.
    expect(resolues[0].valeurAuto).toMatch(/^1\s?200\s?000 Ar$/)
  })

  it("remplit les champs d'activité professeur depuis son dossier", () => {
    const modele = [
      { cle: 'langues', label: 'Langue(s) enseignée(s)' },
      { cle: 'nb_eleves', label: "Nombre d'élèves du professeur" },
      { cle: 'heures_ens', label: 'Heures enseignées par le professeur' },
    ]
    const corps = '{{langues}} {{nb_eleves}} {{heures_ens}}'
    const resolues = preparerVariables(corps, modele, professeur, etablissement, {
      languesEnseignees: ['Anglais', 'Espagnol'],
      nombreElevesActifs: 6,
      heuresEnseignees: 87.5,
    })
    const parCle = Object.fromEntries(resolues.map((v) => [v.cle, v]))

    expect(parCle.langues.valeurAuto).toBe('Anglais, Espagnol')
    expect(parCle.nb_eleves.valeurAuto).toBe('6')
    expect(parCle.heures_ens.valeurAuto).toBe('88')
  })

  it('sans contexte de programme, ces champs restent en saisie manuelle plutôt que vides à tort', () => {
    const resolues = preparerVariables('{{type_prog}}', [{ cle: 'type_prog', label: 'Type de programme' }], etudiant, etablissement)
    expect(resolues[0].valeurAuto).toBeUndefined()
  })
})

/* Contrat DUO (0066, demande client du 2026-09-23) : les deux membres du binôme dans le même
   contrat, chacun avec ses propres informations. */
describe('deduireSource — second membre du duo', () => {
  it('reconnaît le nom/prénom/email de « l’étudiant 2 »', () => {
    expect(deduireSource('nom_etudiant_2', "Nom de l'étudiant 2")).toBe('nom_2')
    expect(deduireSource('prenom_etudiant_2', "Prénom de l'étudiant 2")).toBe('prenom_2')
    expect(deduireSource('email_2', 'E-mail (étudiant 2)')).toBe('email_2')
  })

  it('ne confond pas le champ nu du premier membre avec le second', () => {
    expect(deduireSource('nom_etudiant', "Nom de l'étudiant")).toBe('nom')
  })

  it('le taux horaire n’a pas de variante duo (jamais un contrat professeur)', () => {
    expect(deduireSource('taux_horaire_2', 'Taux horaire 2')).toBeUndefined()
  })
})

describe('preparerVariables — second membre du duo', () => {
  const partenaire: Profile = {
    ...etudiant,
    id: 'p3',
    nom: 'Andria',
    prenom: 'Tojo',
    email: 'tojo@example.mg',
    duo_partenaire_id: 'p1',
  }

  it('remplit les champs du second membre depuis son propre profil', () => {
    const modele = [
      { cle: 'nom1', label: 'Nom (étudiant 1)', source: 'nom' },
      { cle: 'nom2', label: 'Nom (étudiant 2)', source: 'nom_2' },
      { cle: 'email2', label: 'E-mail (étudiant 2)', source: 'email_2' },
    ]
    const resolues = preparerVariables('{{nom1}} {{nom2}} {{email2}}', modele, etudiant, etablissement, undefined, partenaire)
    const parCle = Object.fromEntries(resolues.map((v) => [v.cle, v]))

    expect(parCle.nom1.valeurAuto).toBe('Rakoto')
    expect(parCle.nom2.valeurAuto).toBe('Andria')
    expect(parCle.email2.valeurAuto).toBe('tojo@example.mg')
  })

  it('sans second destinataire, les sources _2 restent en saisie manuelle plutôt que vides à tort', () => {
    const modele = [{ cle: 'nom2', label: 'Nom (étudiant 2)', source: 'nom_2' }]
    const resolues = preparerVariables('{{nom2}}', modele, etudiant, etablissement)
    expect(resolues[0].valeurAuto).toBeUndefined()
  })

  /* Bug signalé par le client le 2026-09-23 : un modèle non pensé pour le DUO (aucun champ _2
     déclaré) ne montrait, une fois généré, QUE les informations du destinataire principal — le
     second signataire n'apparaissait nulle part dans le contrat qu'il devait pourtant signer. */
  it("sans champ _2 déclaré par le modèle, les champs d'identité de base gardent la valeur du principal et portent en plus celle du second membre", () => {
    const modele = [
      { cle: 'nom_complet_etudiant', label: "Nom complet de l'étudiant" },
      { cle: 'adresse_etudiant', label: "Adresse de l'étudiant" },
      { cle: 'type_prog', label: 'Type de programme' },
    ]
    const corps = '{{nom_complet_etudiant}} {{adresse_etudiant}} {{type_prog}}'
    const resolues = preparerVariables(corps, modele, etudiant, etablissement, { typeProgrammeLabel: 'Duo' }, partenaire)
    const parCle = Object.fromEntries(resolues.map((v) => [v.cle, v]))

    expect(parCle.nom_complet_etudiant.valeurAuto).toBe('Miora Rakoto')
    expect(parCle.nom_complet_etudiant.valeurAutoSecondaire).toBe('Tojo Andria')
    // L'adresse du partenaire n'est pas renseignée sur son profil (hérite de `etudiant` sauf
    // override) : elle est donc identique à celle du principal — pas de second paragraphe pour un
    // champ qui ne dirait rien de plus.
    expect(parCle.adresse_etudiant.valeurAuto).toBe('Lot II M 12, Antananarivo')
    expect(parCle.adresse_etudiant.valeurAutoSecondaire).toBeUndefined()
    // Un champ de programme (partagé par construction, pas propre à une personne) n'est jamais
    // dupliqué, même en DUO.
    expect(parCle.type_prog.valeurAuto).toBe('Duo')
    expect(parCle.type_prog.valeurAutoSecondaire).toBeUndefined()
  })

  it("sans champ _2 déclaré, une adresse différente entre les deux membres produit une valeur secondaire", () => {
    const modele = [{ cle: 'adresse_etudiant', label: "Adresse de l'étudiant" }]
    const autrePartenaire = { ...partenaire, adresse: 'Ambohipo, Antananarivo' }
    const resolues = preparerVariables('{{adresse_etudiant}}', modele, etudiant, etablissement, undefined, autrePartenaire)
    expect(resolues[0].valeurAuto).toBe('Lot II M 12, Antananarivo')
    expect(resolues[0].valeurAutoSecondaire).toBe('Ambohipo, Antananarivo')
  })

  it('un modèle qui déclare déjà un champ _2 garde son champ de base propre au seul principal (pas de valeur secondaire)', () => {
    const modele = [
      { cle: 'nom1', label: 'Nom (étudiant 1)', source: 'nom' },
      { cle: 'nom2', label: 'Nom (étudiant 2)', source: 'nom_2' },
    ]
    const resolues = preparerVariables('{{nom1}} {{nom2}}', modele, etudiant, etablissement, undefined, partenaire)
    const parCle = Object.fromEntries(resolues.map((v) => [v.cle, v]))
    expect(parCle.nom1.valeurAuto).toBe('Rakoto')
    expect(parCle.nom1.valeurAutoSecondaire).toBeUndefined()
    expect(parCle.nom2.valeurAuto).toBe('Andria')
  })
})

/* Corps du contrat DUO : chaque paragraphe concerné par le second membre est dupliqué, une
   personne par ligne, plutôt que ses champs joints avec « & » dans la même phrase (illisible et
   grammaticalement faux — « né(e) le date1 & date2 »). Demande client du 2026-09-23. */
describe('substituerVariablesDuo', () => {
  it('sans valeur secondaire, se comporte comme substituerVariables', () => {
    const rendu = substituerVariablesDuo('Entre {{etablissement}} et {{nom}}, domicilié {{adresse}}.', { etablissement: 'HOC', nom: 'Miora Rakoto', adresse: 'Lot X' }, {})
    expect(rendu).toBe('Entre HOC et Miora Rakoto, domicilié Lot X.')
  })

  it('duplique le paragraphe concerné, une personne par ligne, et laisse les autres paragraphes intacts', () => {
    const corps = [
      'Entre {{etablissement}},',
      '',
      '{{nom}}, né(e) le {{naissance}}, domicilié(e) {{adresse}}, ci-après « l’Étudiant »,',
      '',
      'Fait à {{ville}}, le {{date}}.',
    ].join('\n')
    const valeurs = { etablissement: 'HOC', nom: 'Miora Rakoto', naissance: '01/01/2010', adresse: 'Lot X', ville: 'Antananarivo', date: '23/09/2026' }
    const valeursSecondaires = { nom: 'Tojo Andria', naissance: '02/02/2011', adresse: 'Lot Y' }
    const rendu = substituerVariablesDuo(corps, valeurs, valeursSecondaires)

    expect(rendu).toBe(
      [
        'Entre HOC,',
        '',
        'Miora Rakoto, né(e) le 01/01/2010, domicilié(e) Lot X, ci-après « l’Étudiant »,\nTojo Andria, né(e) le 02/02/2011, domicilié(e) Lot Y, ci-après « l’Étudiant »,',
        '',
        'Fait à Antananarivo, le 23/09/2026.',
      ].join('\n'),
    )
  })
})
