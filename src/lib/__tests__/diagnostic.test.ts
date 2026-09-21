import { describe, expect, it } from 'vitest'
import { niveauDepuisReponses, rythmeDepuisReponses } from '../diagnostic'

describe('niveauDepuisReponses', () => {
  it('reprend le niveau estimé du questionnaire', () => {
    expect(niveauDepuisReponses({ niveau_estime: 'B1' })).toBe('B1')
  })

  it('retourne null si la question n’a pas été remplie', () => {
    expect(niveauDepuisReponses({})).toBeNull()
    expect(niveauDepuisReponses({ niveau_estime: '   ' })).toBeNull()
  })
})

describe('rythmeDepuisReponses', () => {
  it('combine heures par semaine et durée de session', () => {
    expect(rythmeDepuisReponses({ heures_par_semaine: '2h', duree_session: '1h' })).toBe('2h / semaine, séances de 1h')
  })

  it('se contente d’un seul des deux champs quand l’autre manque', () => {
    expect(rythmeDepuisReponses({ heures_par_semaine: '2h' })).toBe('2h / semaine')
    expect(rythmeDepuisReponses({ duree_session: '1h30' })).toBe('séances de 1h30')
  })

  it('retourne null si rien n’a été renseigné', () => {
    expect(rythmeDepuisReponses({})).toBeNull()
  })
})
