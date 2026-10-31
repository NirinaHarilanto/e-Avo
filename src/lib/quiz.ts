/* Correction du quiz de positionnement et bilan qui en découle. Volontairement pur (aucune
   requête, aucune horloge) : c'est la pièce qui décide du niveau annoncé à un candidat, elle
   doit être vérifiable par des tests, et elle tourne côté serveur uniquement — le navigateur
   du visiteur ne reçoit jamais les bonnes réponses. */

export interface QuestionCorrigee {
  id: string
  ordre: number
  enonce: string
  options: string[]
  bonne_reponse: number
}

export interface ReponseCandidat {
  question_id: string
  /* Index de la proposition choisie, ou null si la question a été laissée vide. */
  choix: number | null
}

export interface ResultatQuiz {
  score: number
  total: number
  niveau: string
  bilan: string
}

/* Barème convenu avec le client : le quiz situe un candidat pour former des groupes homogènes,
   il ne certifie rien. Les bornes restent larges à dessein — c'est l'oral qui tranche ensuite.

   Rendu dans l'échelle unique de HOC — Beginner / Intermediate / Advanced — depuis le
   2026-10-31 : le quiz rendait jusque-là un niveau CECRL (A1 → C1) que l'application devait
   retraduire en classe, et qui s'affichait tel quel à côté de dossiers déjà libellés
   « Intermediate ». Les SEUILS n'ont pas bougé : ils sont le report exact des anciens à travers
   la correspondance du client (A1/A2 → Beginner sous 0,6 ; B1/B2 → Intermediate de 0,6 à 0,95 ;
   C1 → Advanced au-delà). Aucun candidat déjà corrigé ne change donc de classe. */
export function niveauEstime(score: number, total: number): string {
  if (total === 0) return 'Non évalué'
  const part = score / total
  if (part >= 0.95) return 'Advanced'
  if (part >= 0.6) return 'Intermediate'
  return 'Beginner'
}

export function corriger(questions: QuestionCorrigee[], reponses: ReponseCandidat[]): ResultatQuiz {
  const choixParQuestion = new Map(reponses.map((r) => [r.question_id, r.choix]))
  const total = questions.length
  const justes = questions.filter((q) => choixParQuestion.get(q.id) === q.bonne_reponse)
  const score = justes.length
  const niveau = niveauEstime(score, total)

  return { score, total, niveau, bilan: redigerBilan(questions, choixParQuestion, score, total, niveau) }
}

/* Bilan en texte brut, rattaché au dossier du prospect. Il liste les questions manquées parce
   que c'est ce dont le professeur a besoin avant l'oral : savoir sur quoi appuyer. */
function redigerBilan(
  questions: QuestionCorrigee[],
  choixParQuestion: Map<string, number | null>,
  score: number,
  total: number,
  niveau: string,
): string {
  const manquees = questions
    .filter((q) => choixParQuestion.get(q.id) !== q.bonne_reponse)
    .map((q) => {
      const choix = choixParQuestion.get(q.id)
      const donnee = choix == null ? 'sans réponse' : `« ${q.options[choix] ?? '?'} »`
      return `- Q${q.ordre} : ${donnee}, attendu « ${q.options[q.bonne_reponse] ?? '?'} »`
    })

  const lignes = [
    `Test de positionnement écrit : ${score}/${total} — niveau estimé ${niveau}.`,
    '',
    manquees.length === 0
      ? 'Toutes les réponses sont justes.'
      : `Points à revoir (${manquees.length}) :\n${manquees.join('\n')}`,
    '',
    'Ce résultat est indicatif : le niveau définitif est fixé à l’issue du test oral.',
  ]
  return lignes.join('\n')
}
