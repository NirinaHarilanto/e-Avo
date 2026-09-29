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

/* Compte rendu de la simulation de cours sur Google Meet. */
export const CHECKLIST_SIMULATION: ChampChecklist[] = [
  { cle: 'date_simulation', libelle: 'Date de la simulation', type: 'date' },
  { cle: 'theme', libelle: 'Thème / niveau du cours simulé', type: 'texte' },
  { cle: 'preparation', libelle: 'Préparation et structure (objectifs clairs, déroulé)', type: 'note' },
  { cle: 'anglais', libelle: 'Qualité de l’anglais (prononciation, fluidité, justesse)', type: 'note' },
  { cle: 'pedagogie', libelle: 'Pédagogie et clarté des explications', type: 'note' },
  { cle: 'interaction', libelle: 'Interaction et temps de parole laissé à l’élève', type: 'note' },
  { cle: 'correction', libelle: 'Correction des erreurs', type: 'note' },
  { cle: 'temps', libelle: 'Gestion du temps', type: 'note' },
  { cle: 'outils', libelle: 'Maîtrise de Google Meet et des supports', type: 'note' },
  { cle: 'posture', libelle: 'Posture professionnelle et ponctualité', type: 'note' },
  { cle: 'points_forts', libelle: 'Points forts', type: 'texte' },
  { cle: 'points_ameliorer', libelle: 'Points à améliorer', type: 'texte' },
  {
    cle: 'avis',
    libelle: 'Avis final',
    type: 'choix',
    options: [
      { valeur: 'favorable', libelle: 'Favorable' },
      { valeur: 'defavorable', libelle: 'Défavorable' },
    ],
  },
]

export function moyenneSimulation(valeurs: ValeursChecklist): number | null {
  const notes = CHECKLIST_SIMULATION.filter((c) => c.type === 'note')
    .map((c) => Number(valeurs[c.cle]))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (notes.length === 0) return null
  return Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10
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
