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
  /* Échelle unique de HOC depuis le 2026-10-31 (Beginner / Intermediate / Advanced). Les SEUILS
     sont le report exact des anciens paliers CECRL à travers la correspondance du client :
     A1/A2 → Beginner sous 0,6 ; B1/B2 → Intermediate de 0,6 à 0,95 ; C1 → Advanced au-delà.
     Aucun candidat déjà corrigé ne change donc de classe. */
  it('place les paliers du barème convenu', () => {
    expect(niveauEstime(10, 10)).toBe('Advanced')
    expect(niveauEstime(8, 10)).toBe('Intermediate')
    expect(niveauEstime(6, 10)).toBe('Intermediate')
    expect(niveauEstime(4, 10)).toBe('Beginner')
    expect(niveauEstime(3, 10)).toBe('Beginner')
  })

  /* La borne haute est à 0,95 et non à 1 : 19 bonnes réponses sur 20 restent Advanced, comme
     l'ancien barème donnait C1. */
  it('reste Advanced à une erreur près sur vingt questions', () => {
    expect(niveauEstime(19, 20)).toBe('Advanced')
    expect(niveauEstime(18, 20)).toBe('Intermediate')
  })

  it('ne divise pas par zéro quand aucune question n’est active', () => {
    expect(niveauEstime(0, 0)).toBe('Non évalué')
  })
})
