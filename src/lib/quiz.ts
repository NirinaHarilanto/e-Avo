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

/* Barème convenu avec le client : le quiz situe un candidat sur l'échelle CECRL pour former des
   groupes homogènes, il ne certifie rien. Les bornes restent larges à dessein — c'est l'oral
   qui tranche ensuite. */
export function niveauEstime(score: number, total: number): string {
  if (total === 0) return 'Non évalué'
  const part = score / total
  if (part >= 0.95) return 'C1'
  if (part >= 0.8) return 'B2'
  if (part >= 0.6) return 'B1'
  if (part >= 0.4) return 'A2'
  return 'A1 (débutant)'
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
