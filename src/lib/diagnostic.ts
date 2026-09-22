/* Questionnaire de l'appel diagnostic, tel que fourni par le client le 2026-09-21. Décrit en
   données plutôt qu'en JSX : le formulaire de saisie, le récapitulatif lisible affiché dans le
   dossier de l'élève et la génération du texte de synthèse partent tous de cette même liste,
   ce qui évite qu'une question ajoutée ici soit oubliée à l'un des trois endroits. */

export type TypeQuestion = 'texte' | 'choix' | 'choix-multiple' | 'zone'

export interface QuestionDiagnostic {
  cle: string
  libelle: string
  type: TypeQuestion
  options?: string[]
  /* Autorise une saisie libre en plus des options cochées (« Autre (à préciser) »). */
  precision?: boolean
  placeholder?: string
}

export interface SectionDiagnostic {
  titre: string
  questions: QuestionDiagnostic[]
}

export const SECTIONS_DIAGNOSTIC: SectionDiagnostic[] = [
  {
    titre: 'Profil',
    questions: [
      { cle: 'pays_residence', libelle: 'Pays de résidence', type: 'texte', placeholder: 'Madagascar, France…' },
      { cle: 'age_approximatif', libelle: 'Âge approximatif', type: 'texte', placeholder: '25-35 ans' },
      {
        cle: 'situation_actuelle',
        libelle: 'Situation actuelle',
        type: 'choix',
        options: ['Étudiant', 'Salarié', 'Indépendant', 'Recherche d’emploi'],
      },
      { cle: 'poste_domaine', libelle: 'Poste / domaine d’activité', type: 'texte', placeholder: 'Comptabilité, tourisme…' },
    ],
  },
  {
    titre: 'Objectifs',
    questions: [
      {
        cle: 'raison_cours',
        libelle: 'Pourquoi souhaitez-vous prendre des cours d’anglais ?',
        type: 'choix-multiple',
        precision: true,
        options: [
          'Besoin professionnel (travail, évolution de carrière, communication)',
          'Projet personnel (voyage, expatriation…)',
          'Préparation d’un test ou certification (IELTS, TOEIC, etc.)',
          'Études (université, admission, soutien scolaire)',
          'Développement personnel (confiance, culture, loisir)',
        ],
      },
      {
        cle: 'objectif_principal',
        libelle: 'Objectif principal',
        type: 'choix',
        precision: true,
        options: [
          'Gagner en aisance à l’oral',
          'Écrire des e-mails',
          'Préparer un examen',
          'Comprendre l’anglais dans votre secteur',
        ],
      },
    ],
  },
  {
    titre: 'Niveau d’anglais actuel',
    questions: [
      {
        cle: 'aisance_presentation',
        libelle: 'Seriez-vous à l’aise pour vous présenter en quelques phrases en anglais ?',
        type: 'choix',
        options: ['Oui', 'Plutôt oui', 'Plutôt non', 'Non'],
      },
    ],
  },
  {
    titre: 'Disponibilités et logistique',
    questions: [
      {
        cle: 'moments_disponibles',
        libelle: 'Moments de la journée disponibles',
        type: 'choix-multiple',
        options: ['Matin', 'Après-midi', 'Soir'],
      },
      {
        cle: 'jours_disponibles',
        libelle: 'Jours disponibles',
        type: 'choix-multiple',
        options: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
      },
      {
        cle: 'connait_google_meet',
        libelle: 'Savez-vous utiliser Google Meet ?',
        type: 'choix',
        options: ['Oui', 'Non'],
      },
    ],
  },
  {
    titre: 'Rythme souhaité',
    questions: [
      {
        cle: 'heures_par_semaine',
        libelle: 'Combien d’heures par semaine souhaitez-vous consacrer aux cours ?',
        type: 'choix',
        options: ['1h', '2h', '3h', '4h', '5h'],
      },
      {
        cle: 'duree_session',
        libelle: 'Durée des sessions',
        type: 'choix',
        options: ['30 min', '1h', '1h30', '2h00'],
      },
    ],
  },
  {
    titre: 'Notes internes',
    questions: [
      { cle: 'niveau_estime', libelle: 'Niveau estimé', type: 'texte', placeholder: 'Ex. B1' },
      { cle: 'profil_formateur', libelle: 'Profil du formateur idéal', type: 'zone' },
      { cle: 'besoins_prioritaires', libelle: 'Besoins prioritaires', type: 'zone' },
      { cle: 'programme_recommande', libelle: 'Type de programme recommandé', type: 'zone' },
    ],
  },
]

/* Une réponse est soit une valeur simple, soit une liste de cases cochées. La précision libre
   d'une question « Autre » vit sous la clé `<cle>_precision`, ce qui évite un type imbriqué
   pour un cas de figure marginal. */
export type ReponsesDiagnostic = Record<string, string | string[] | undefined>

export function estRempli(reponses: ReponsesDiagnostic): boolean {
  return Object.values(reponses).some((valeur) =>
    Array.isArray(valeur) ? valeur.length > 0 : (valeur ?? '').trim().length > 0,
  )
}

/* `diagnostic_calls.niveau_evalue`/`rythme_convenu` (les deux champs "en tête" affichés partout
   dans l'app — carte prospect, dossier étudiant) redisaient ce que portait déjà le
   questionnaire : demande client du 2026-09-21, « corrige les redondances ». Plutôt que deux
   sources à tenir d'accord, ces deux valeurs sont désormais CALCULÉES depuis les réponses du
   questionnaire au moment de l'enregistrement — un seul endroit où les saisir. */
export function niveauDepuisReponses(reponses: ReponsesDiagnostic): string | null {
  const valeur = reponses.niveau_estime
  return typeof valeur === 'string' && valeur.trim().length > 0 ? valeur.trim() : null
}

export function rythmeDepuisReponses(reponses: ReponsesDiagnostic): string | null {
  const heures = reponses.heures_par_semaine
  const duree = reponses.duree_session
  const parties = [
    typeof heures === 'string' && heures ? `${heures} / semaine` : null,
    typeof duree === 'string' && duree ? `séances de ${duree}` : null,
  ].filter((p): p is string => !!p)
  return parties.length > 0 ? parties.join(', ') : null
}

/** Rend une réponse lisible d'un coup d'œil, cases cochées comprises. */
export function formaterReponse(reponses: ReponsesDiagnostic, question: QuestionDiagnostic): string | null {
  const valeur = reponses[question.cle]
  const precision = reponses[`${question.cle}_precision`]
  const base = Array.isArray(valeur) ? valeur.join(', ') : (valeur ?? '')
  const texte = [base, typeof precision === 'string' ? precision.trim() : ''].filter((p) => p.length > 0).join(' — ')
  return texte.length > 0 ? texte : null
}

/* Synthèse en texte brut, reprise telle quelle dans les notes du diagnostic pour rester
   lisible depuis n'importe quel écran qui affiche déjà ces notes sans connaître le
   questionnaire. */
export function synthetiser(reponses: ReponsesDiagnostic): string {
  const lignes: string[] = []
  for (const section of SECTIONS_DIAGNOSTIC) {
    const reponduesDeLaSection = section.questions
      .map((q) => {
        const texte = formaterReponse(reponses, q)
        return texte ? `- ${q.libelle} : ${texte}` : null
      })
      .filter((l): l is string => l !== null)
    if (reponduesDeLaSection.length === 0) continue
    lignes.push(section.titre.toUpperCase(), ...reponduesDeLaSection, '')
  }
  return lignes.join('\n').trim()
}
