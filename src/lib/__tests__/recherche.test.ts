import { describe, expect, it } from 'vitest'
import { correspondARecherche, normaliserPourRecherche } from '../recherche'

/* Cas réel du 2026-11-04 : « Nomena ANDRY TAHIANA », converti de prospect en étudiant, restait
   introuvable dans la liste des étudiants parce que le client le cherchait sous « Andry nomena »
   — le nom avant le prénom, l'usage courant à Madagascar. Sa fiche était pourtant intacte. */
describe('correspondARecherche', () => {
  const ANDRY = 'Nomena ANDRY TAHIANA'

  it('trouve la personne quel que soit l’ordre des mots tapés', () => {
    expect(correspondARecherche(ANDRY, 'Nomena Andry')).toBe(true)
    // L'ordre qui échouait avant le correctif.
    expect(correspondARecherche(ANDRY, 'Andry nomena')).toBe(true)
    expect(correspondARecherche(ANDRY, 'tahiana nomena')).toBe(true)
  })

  it('accepte un seul mot, n’importe lequel', () => {
    expect(correspondARecherche(ANDRY, 'andry')).toBe(true)
    expect(correspondARecherche(ANDRY, 'TAHIANA')).toBe(true)
  })

  it('exige que TOUS les mots tapés soient présents', () => {
    expect(correspondARecherche(ANDRY, 'Andry Rakoto')).toBe(false)
  })

  it('ignore les accents dans les deux sens', () => {
    expect(correspondARecherche('Anaïs RASOANAIVO', 'anais')).toBe(true)
    expect(correspondARecherche('Anais RASOANAIVO', 'anaïs')).toBe(true)
  })

  it('ignore les espaces superflus et laisse tout passer si rien n’est tapé', () => {
    expect(correspondARecherche(ANDRY, '   ')).toBe(true)
    expect(correspondARecherche(ANDRY, '')).toBe(true)
    expect(correspondARecherche(ANDRY, '  andry   nomena  ')).toBe(true)
  })

  it('ne confond pas deux personnes aux noms proches', () => {
    expect(correspondARecherche('Nomena ANDRY TAHIANA', 'nomena rabe')).toBe(false)
    expect(correspondARecherche('Nomena RABE', 'nomena rabe')).toBe(true)
  })
})

describe('normaliserPourRecherche', () => {
  it('met en minuscules et retire les diacritiques', () => {
    expect(normaliserPourRecherche('Anaïs ÉLÈVE')).toBe('anais eleve')
  })
})
