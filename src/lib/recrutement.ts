/* Process de recrutement et d'onboarding des formateurs HOC (0082, transmis par le client le
   2026-09-29), décrit en données : les écrans admin et le formulaire public lisent tous ces
   listes, un seul endroit à retoucher si le process évolue. Aucune requête ici. */

export type StatutCandidature = 'recue' | 'preselection' | 'tests' | 'simulation' | 'integration' | 'integre' | 'refusee'
export type DiplomeDeclare = 'licence_anglais' | 'tefl' | 'licence_et_tefl' | 'autre'

export const DIPLOMES_DECLARES: { valeur: DiplomeDeclare; libelle: string }[] = [
  { valeur: 'licence_anglais', libelle: 'Licence en études anglophones' },
  { valeur: 'tefl', libelle: 'Certification TEFL reconnue' },
  { valeur: 'licence_et_tefl', libelle: 'Les deux (licence et TEFL)' },
  { valeur: 'autre', libelle: 'Autre diplôme ou certificat' },
]

export const ETAPES: { statut: StatutCandidature; libelle: string; phase: 'Réception' | 'Sélection' | 'Intégration' | 'Terminé' }[] = [
  { statut: 'recue', libelle: 'Dossier reçu', phase: 'Réception' },
  { statut: 'preselection', libelle: 'Appel de pré-sélection', phase: 'Sélection' },
  { statut: 'tests', libelle: 'Tests d’anglais', phase: 'Sélection' },
  { statut: 'simulation', libelle: 'Simulation de cours', phase: 'Sélection' },
  { statut: 'integration', libelle: 'Phase d’intégration', phase: 'Intégration' },
  { statut: 'integre', libelle: 'Intégré', phase: 'Terminé' },
  { statut: 'refusee', libelle: 'Non retenu', phase: 'Terminé' },
]

export function libelleStatut(statut: StatutCandidature): string {
  return ETAPES.find((e) => e.statut === statut)?.libelle ?? statut
}

/* ---------------------------------------------------------------------------------------------
   Champs de checklist génériques : case, texte, nombre, date, note 1 à 5, choix.
   --------------------------------------------------------------------------------------------- */
export type TypeChamp = 'case' | 'texte' | 'nombre' | 'date' | 'note' | 'choix'
export interface ChampChecklist {
  cle: string
  libelle: string
  type: TypeChamp
  aide?: string
  options?: { valeur: string; libelle: string }[]
  /* Haut de l'échelle d'un champ `note`. 5 par défaut (pré-sélection), mais la grille officielle
     de simulation de cours note chaque critère sur 4 — voir NOTE_MAX_SIMULATION. */
  noteMax?: number
}

export type ValeursChecklist = Record<string, string | number | boolean | null | undefined>

/* Appel de pré-sélection — le client demandait « expériences, taux horaire, QUOI d'autre ? » :
   les rubriques ajoutées couvrent ce qu'il faut savoir avant d'investir du temps de test. */
export const CHECKLIST_PRESELECTION: ChampChecklist[] = [
  { cle: 'date_appel', libelle: 'Date de l’appel', type: 'date' },
  { cle: 'experiences', libelle: 'Expériences d’enseignement (années, publics, contextes)', type: 'texte' },
  { cle: 'taux_horaire', libelle: 'Taux horaire souhaité (Ar/h)', type: 'nombre' },
  { cle: 'disponibilites', libelle: 'Disponibilités (jours, créneaux, heures par semaine)', type: 'texte' },
  { cle: 'date_demarrage', libelle: 'Date de démarrage possible', type: 'date' },
  { cle: 'activite_actuelle', libelle: 'Activité actuelle (salarié, freelance, étudiant…)', type: 'texte' },
  { cle: 'specialites', libelle: 'Spécialités (anglais général, business, TOEIC/IELTS, enfants…)', type: 'texte' },
  { cle: 'formats', libelle: 'Formats acceptés (individuel, duo, collectif)', type: 'texte' },
  { cle: 'materiel', libelle: 'Ordinateur, connexion stable, casque-micro, lieu calme', type: 'case' },
  { cle: 'google_meet', libelle: 'À l’aise avec Google Meet et les supports en ligne', type: 'case' },
  { cle: 'valeurs', libelle: 'Motivation et adhésion aux valeurs HOC confirmées', type: 'case' },
  { cle: 'impression', libelle: 'Impression générale / notes de l’appel', type: 'texte' },
]

export const NIVEAUX_CECRL = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type NiveauCecrl = (typeof NIVEAUX_CECRL)[number]
export const NIVEAU_MINIMUM: NiveauCecrl = 'C1'

export const TESTS_ANGLAIS: { cle: string; libelle: string }[] = [
  { cle: 'reading', libelle: 'Reading' },
  { cle: 'listening', libelle: 'Listening' },
  { cle: 'grammar_vocabulary', libelle: 'Grammar & Vocabulary' },
]

export interface ResultatTest {
  fait?: boolean
  note?: number | null
  niveau?: NiveauCecrl | null
}
export interface ValeursTests {
  [cle: string]: ResultatTest | NiveauCecrl | string | null | undefined
  niveau_global?: NiveauCecrl | null
  commentaire?: string | null
}

function rang(niveau: string | null | undefined): number {
  return niveau ? NIVEAUX_CECRL.indexOf(niveau as NiveauCecrl) : -1
}

export function niveauAuMoins(niveau: string | null | undefined, minimum: NiveauCecrl = NIVEAU_MINIMUM): boolean {
  return rang(niveau) >= rang(minimum)
}

/* Niveau global proposé par défaut : le plus faible des trois tests — on ne recrute pas un
   formateur C1 à l'écrit mais B2 à l'oral. `null` tant que les trois ne sont pas renseignés. */
export function niveauGlobalPropose(tests: ValeursTests): NiveauCecrl | null {
  const niveaux = TESTS_ANGLAIS.map((t) => (tests[t.cle] as ResultatTest | undefined)?.niveau ?? null)
  if (niveaux.some((n) => !n)) return null
  return niveaux.reduce<NiveauCecrl>((min, n) => (rang(n) < rang(min) ? (n as NiveauCecrl) : min), 'C2')
}

export function niveauGlobal(tests: ValeursTests): NiveauCecrl | null {
  return (tests.niveau_global as NiveauCecrl | null | undefined) ?? niveauGlobalPropose(tests)
}

export function testsReussis(tests: ValeursTests): boolean {
  const tousFaits = TESTS_ANGLAIS.every((t) => (tests[t.cle] as ResultatTest | undefined)?.fait)
  return tousFaits && niveauAuMoins(niveauGlobal(tests))
}

/* ---------------------------------------------------------------------------------------------
   Grille d'évaluation de la simulation de cours — document client « HOC_Grille_evaluation_
   simulation », intégré le 2026-10-01. Elle remplace la grille maison précédente (8 critères
   notés sur 5, moyenne indicative, avis final saisi à la main) : c'est désormais la règle écrite
   de l'établissement qui tranche, et non l'appréciation de celui qui remplit.

   « Un candidat est validé à partir de 14/20, sans aucun critère noté 1. »
   --------------------------------------------------------------------------------------------- */

export const NOTE_MAX_SIMULATION = 4
export const TOTAL_SIMULATION_MAX = 20
export const TOTAL_SIMULATION_REQUIS = 14
/* Durée plancher de la simulation, annoncée dans la grille (« 30 min minimum »). Renseignée en
   clair plutôt que contrôlée automatiquement : une simulation de 28 minutes peut rester
   concluante, c'est à l'évaluatrice d'en juger — le champ sert de trace, pas de verrou. */
export const DUREE_MIN_SIMULATION = 30

export const ECHELLE_SIMULATION: { valeur: number; libelle: string }[] = [
  { valeur: 1, libelle: '1 — Insuffisant (bloquant)' },
  { valeur: 2, libelle: '2 — À améliorer' },
  { valeur: 3, libelle: '3 — Bon' },
  { valeur: 4, libelle: '4 — Excellent' },
]

/* Contexte de la simulation : l'en-tête « Candidat » de la grille. L'évaluatrice n'y figure pas —
   c'est l'admin connecté qui remplit, et son identité est déjà dans la trace de la candidature ;
   le niveau aux tests n'y figure pas non plus, l'application le connaît déjà (TESTS_ANGLAIS,
   C1 minimum contrôlé par `testsReussis`) et l'afficher est plus fiable que le retaper. */
export const CONTEXTE_SIMULATION: ChampChecklist[] = [
  { cle: 'date_simulation', libelle: 'Date de la simulation', type: 'date' },
  { cle: 'theme', libelle: 'Thème choisi par le candidat', type: 'texte' },
  {
    cle: 'duree_minutes',
    libelle: 'Durée effective (minutes)',
    type: 'nombre',
    aide: `${DUREE_MIN_SIMULATION} minutes minimum attendues.`,
  },
]

/* Les cinq critères de la grille, dans son ordre, avec « ce que tu observes » en texte d'aide. */
export const CRITERES_SIMULATION: ChampChecklist[] = [
  {
    cle: 'delivrance',
    libelle: '1. Façon de délivrer la leçon',
    type: 'note',
    noteMax: NOTE_MAX_SIMULATION,
    aide: 'Structure claire (début, déroulé, fin), consignes compréhensibles, gestion du temps.',
  },
  {
    cle: 'oral',
    libelle: '2. Aisance à l’oral',
    type: 'note',
    noteMax: NOTE_MAX_SIMULATION,
    aide: 'Prononciation, fluidité, langue adaptée à l’apprenant, clarté des explications.',
  },
  {
    cle: 'stress',
    libelle: '3. Gestion du stress',
    type: 'note',
    noteMax: NOTE_MAX_SIMULATION,
    aide: 'Calme, capacité à rebondir face à une question ou une difficulté, posture assurée.',
  },
  {
    cle: 'activites',
    libelle: '4. Activités et contenu',
    type: 'note',
    noteMax: NOTE_MAX_SIMULATION,
    aide: 'Pertinence du contenu, variété et intérêt des activités, cohérence avec le thème.',
  },
  {
    cle: 'methode_hoc',
    libelle: '5. Méthode HOC',
    type: 'note',
    noteMax: NOTE_MAX_SIMULATION,
    aide: 'Place donnée à la conversation, temps de parole laissé à l’apprenant, grammaire au service de la communication.',
  },
]

/* Sortie de la grille. « Points à travailler pendant l'onboarding » n'est pas un simple
   commentaire : le document précise qu'ils servent à adapter la session 2 d'onboarding — ils sont
   donc rappelés dans la phase d'intégration (voir FicheCandidat.tsx). */
export const SORTIE_SIMULATION: ChampChecklist[] = [
  { cle: 'points_forts', libelle: 'Points forts', type: 'texte' },
  {
    cle: 'points_ameliorer',
    libelle: 'Points à travailler pendant l’onboarding',
    type: 'texte',
    aide: 'Transmis à l’onboarding : ils serviront à adapter la session 2.',
  },
]

/* Conservé pour les écrans qui affichent la grille entière d'un bloc. */
export const CHECKLIST_SIMULATION: ChampChecklist[] = [
  ...CONTEXTE_SIMULATION,
  ...CRITERES_SIMULATION,
  ...SORTIE_SIMULATION,
]

export interface ResultatSimulation {
  /* Total sur 20, ou null tant que les cinq critères ne sont pas tous notés : un total partiel
     ferait croire à un candidat recalé alors qu'il reste des critères à remplir. */
  total: number | null
  critereBloquant: string | null
  complete: boolean
  valide: boolean
}

/* Applique la règle du document, sans interprétation : total de 14/20 ou plus ET aucun critère
   noté 1. Les deux conditions sont rendues séparément pour que l'écran puisse dire LAQUELLE
   manque — « 15/20 mais un critère à 1 » doit se lire comme un refus motivé, pas comme un refus
   inexpliqué. */
export function resultatSimulation(valeurs: ValeursChecklist): ResultatSimulation {
  const notes = CRITERES_SIMULATION.map((critere) => {
    const brut = Number(valeurs[critere.cle])
    return Number.isFinite(brut) && brut > 0 ? brut : null
  })

  const complete = notes.every((n) => n !== null)
  const total = complete ? (notes as number[]).reduce((a, b) => a + b, 0) : null
  const indexBloquant = notes.findIndex((n) => n === 1)
  const critereBloquant = indexBloquant >= 0 ? CRITERES_SIMULATION[indexBloquant].libelle : null

  return {
    total,
    critereBloquant,
    complete,
    valide: complete && (total as number) >= TOTAL_SIMULATION_REQUIS && critereBloquant === null,
  }
}

/* Phase d'intégration. La signature du contrat se constate sur le contrat lui-même (statut
   « signé »), elle n'est pas une case que l'on coche à la main. */
export const CHECKLIST_INTEGRATION: { cle: string; libelle: string; automatique?: boolean }[] = [
  { cle: 'contrat_signe', libelle: 'Signature du contrat', automatique: true },
  { cle: 'onboarding_outils', libelle: 'Onboarding session 1 : relation admin et outils' },
  { cle: 'observation_collectif', libelle: 'Observation d’un cours collectif' },
  { cle: 'onboarding_pedagogie', libelle: 'Onboarding session 2 : pédagogie' },
  { cle: 'guide_formateur', libelle: 'Remise du guide formateur' },
]

export interface EtatIntegration {
  [cle: string]: { fait?: boolean; date?: string | null } | undefined
}

export function integrationComplete(etat: EtatIntegration, contratSigne: boolean): boolean {
  return CHECKLIST_INTEGRATION.every((item) => (item.automatique ? contratSigne : !!etat[item.cle]?.fait))
}
