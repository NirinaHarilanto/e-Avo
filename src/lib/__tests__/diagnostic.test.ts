import { describe, expect, it } from 'vitest'
import {
  SECTIONS_DIAGNOSTIC,
  extraireCles,
  niveauDepuisReponses,
  rythmeDepuisReponses,
  sectionsIndividuellesDuo,
  sectionsPartageesDuo,
} from '../diagnostic'

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

describe('sections communes/individuelles d’un binôme DUO (0060)', () => {
  it('classe « Disponibilités et logistique » et « Rythme souhaité » côté commun', () => {
    const cles = sectionsPartageesDuo().flatMap((s) => s.questions.map((q) => q.cle))
    expect(cles).toEqual(
      expect.arrayContaining(['moments_disponibles', 'jours_disponibles', 'connait_google_meet', 'heures_par_semaine', 'duree_session']),
    )
  })

  it('sépare « Notes internes » : niveau estimé individuel, le reste commun', () => {
    const communes = sectionsPartageesDuo().flatMap((s) => s.questions.map((q) => q.cle))
    const individuelles = sectionsIndividuellesDuo().flatMap((s) => s.questions.map((q) => q.cle))

    expect(communes).toEqual(expect.arrayContaining(['profil_formateur', 'besoins_prioritaires', 'programme_recommande']))
    expect(individuelles).toContain('niveau_estime')
    expect(communes).not.toContain('niveau_estime')
  })

  it('ne perd et ne duplique aucune question de la trame complète', () => {
    const total = SECTIONS_DIAGNOSTIC.flatMap((s) => s.questions.map((q) => q.cle))
    const reparti = [...sectionsPartageesDuo(), ...sectionsIndividuellesDuo()].flatMap((s) => s.questions.map((q) => q.cle))
    expect(reparti.sort()).toEqual(total.sort())
  })

  it('ne garde que des sections non vides', () => {
    for (const section of [...sectionsPartageesDuo(), ...sectionsIndividuellesDuo()]) {
      expect(section.questions.length).toBeGreaterThan(0)
    }
  })
})

describe('extraireCles', () => {
  it('ne garde que les réponses des sections données', () => {
    const reponses = { pays_residence: 'Madagascar', heures_par_semaine: '2h', niveau_estime: 'B1' }
    expect(extraireCles(reponses, sectionsPartageesDuo())).toEqual({ heures_par_semaine: '2h' })
  })

  it('conserve la précision libre d’une question « Autre » avec sa question de base', () => {
    const reponses = { raison_cours: ['Autre'], raison_cours_precision: 'Immigration', niveau_estime: 'B1' }
    expect(extraireCles(reponses, sectionsIndividuellesDuo())).toEqual(reponses)
  })
})
