import { describe, expect, it } from 'vitest'
import { corriger, niveauEstime, type QuestionCorrigee } from '../quiz'

const questions: QuestionCorrigee[] = [
  { id: 'q1', ordre: 1, enonce: 'Choose the correct sentence:', options: ['She does lives in London.', 'She lives in London.'], bonne_reponse: 1 },
  { id: 'q2', ordre: 2, enonce: 'I ______ coffee every morning.', options: ['drinks', 'drink'], bonne_reponse: 1 },
  { id: 'q3', ordre: 3, enonce: 'She has worked here ______ 2022.', options: ['from', 'since'], bonne_reponse: 1 },
]

describe('corriger', () => {
  it('compte les bonnes réponses', () => {
    const resultat = corriger(questions, [
      { question_id: 'q1', choix: 1 },
      { question_id: 'q2', choix: 0 },
      { question_id: 'q3', choix: 1 },
    ])
    expect(resultat.score).toBe(2)
    expect(resultat.total).toBe(3)
  })

  it('traite une question sans réponse comme fausse, sans planter', () => {
    const resultat = corriger(questions, [{ question_id: 'q1', choix: null }])
    expect(resultat.score).toBe(0)
    expect(resultat.bilan).toContain('sans réponse')
  })

  it('ignore une réponse envoyée pour une question inconnue plutôt que de la compter', () => {
    const resultat = corriger(questions, [
      { question_id: 'q1', choix: 1 },
      { question_id: 'question-supprimee', choix: 0 },
    ])
    expect(resultat.score).toBe(1)
    expect(resultat.total).toBe(3)
  })

  it('liste les questions manquées avec la réponse attendue', () => {
    const resultat = corriger(questions, [{ question_id: 'q2', choix: 0 }])
    expect(resultat.bilan).toContain('Q2 : « drinks », attendu « drink »')
  })

  it('signale un sans-faute', () => {
    const resultat = corriger(questions, questions.map((q) => ({ question_id: q.id, choix: q.bonne_reponse })))
    expect(resultat.score).toBe(3)
    expect(resultat.bilan).toContain('Toutes les réponses sont justes')
  })
})

describe('niveauEstime', () => {
  it('place les paliers du barème convenu', () => {
    expect(niveauEstime(10, 10)).toBe('C1')
    expect(niveauEstime(8, 10)).toBe('B2')
    expect(niveauEstime(6, 10)).toBe('B1')
    expect(niveauEstime(4, 10)).toBe('A2')
    expect(niveauEstime(3, 10)).toBe('A1 (débutant)')
  })

  it('ne divise pas par zéro quand aucune question n’est active', () => {
    expect(niveauEstime(0, 0)).toBe('Non évalué')
  })
})
