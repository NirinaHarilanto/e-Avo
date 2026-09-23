import { describe, expect, it } from 'vitest'
import { categorieDepuisNiveauEstime } from '../classesCollectif'

describe('categorieDepuisNiveauEstime', () => {
  it('classe A1 et A2 en beginner', () => {
    expect(categorieDepuisNiveauEstime('A1 (débutant)')).toBe('beginner')
    expect(categorieDepuisNiveauEstime('A2')).toBe('beginner')
  })

  it('classe B1 et B2 en intermediate', () => {
    expect(categorieDepuisNiveauEstime('B1')).toBe('intermediate')
    expect(categorieDepuisNiveauEstime('B2')).toBe('intermediate')
  })

  it('classe C1 en advanced', () => {
    expect(categorieDepuisNiveauEstime('C1')).toBe('advanced')
  })

  it("renvoie null pour un niveau non évalué ou inconnu", () => {
    expect(categorieDepuisNiveauEstime('Non évalué')).toBeNull()
    expect(categorieDepuisNiveauEstime(null)).toBeNull()
    expect(categorieDepuisNiveauEstime('valeur-inattendue')).toBeNull()
  })
})
