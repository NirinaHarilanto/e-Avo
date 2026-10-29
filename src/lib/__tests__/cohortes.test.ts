import { describe, expect, it } from 'vitest'
import { libelleVague, nomVagueSeul, trierVaguesChronologiquement } from '../cohortes'

function vague(id: string, dateDebut: string, dateFin = dateDebut) {
  return { id, date_debut: dateDebut, date_fin: dateFin }
}

/* Demande client du 2026-10-10, précisée le 2026-10-29 devant les vraies vagues en production :
   un premier essai triait par proximité à aujourd'hui plutôt que par calendrier, et plaçait une
   vague à venir avant une vague déjà en cours — corrigé ici en un tri chronologique ordinaire. */
describe('trierVaguesChronologiquement', () => {
  it('place la date de début la plus ancienne en premier, qu’elle soit passée ou future', () => {
    const resultat = trierVaguesChronologiquement([
      vague('future', '2026-12-29'),
      vague('passee', '2026-08-01'),
      vague('en-cours', '2026-09-20'),
      vague('proche', '2026-10-17'),
    ])
    expect(resultat.map((v) => v.id)).toEqual(['passee', 'en-cours', 'proche', 'future'])
  })

  it('départage une égalité de date de début par la date de fin la plus proche', () => {
    const resultat = trierVaguesChronologiquement([
      vague('longue', '2026-11-01', '2027-03-01'),
      vague('courte', '2026-11-01', '2026-12-15'),
    ])
    expect(resultat.map((v) => v.id)).toEqual(['courte', 'longue'])
  })

  it('ne modifie pas le tableau d’origine (nouvelle référence)', () => {
    const original = [vague('a', '2026-12-01'), vague('b', '2026-10-11')]
    const resultat = trierVaguesChronologiquement(original)
    expect(resultat).not.toBe(original)
    expect(original.map((v) => v.id)).toEqual(['a', 'b'])
  })

  it('une liste vide reste vide', () => {
    expect(trierVaguesChronologiquement([])).toEqual([])
  })
})

/* Le mot « vague » ne doit apparaître qu'une fois à l'écran, que l'admin l'ait mis dans le nom de
   la vague ou pas (capture client du 2026-10-11 : « (vague Vague Novembre) »). */
describe('nomVagueSeul', () => {
  it('retire le mot quand la phrase le porte déjà', () => {
    expect(nomVagueSeul('Vague Novembre')).toBe('Novembre')
    expect(nomVagueSeul('vague novembre')).toBe('novembre')
  })

  it('absorbe l’article avec le mot, sans laisser de « de » orphelin', () => {
    expect(nomVagueSeul('Vague de Décembre')).toBe('Décembre')
    expect(nomVagueSeul('Vague du printemps')).toBe('printemps')
    expect(nomVagueSeul('Vague d’octobre')).toBe('octobre')
  })

  it('laisse intact un nom qui ne porte pas le mot', () => {
    expect(nomVagueSeul('Novembre')).toBe('Novembre')
    expect(nomVagueSeul('Promotion 2026')).toBe('Promotion 2026')
  })

  it('ne mord pas sur un nom qui commence par les mêmes lettres', () => {
    expect(nomVagueSeul('Vaguemestre')).toBe('Vaguemestre')
  })

  it('rend le nom tel quel quand le retrait ne laisserait rien', () => {
    expect(nomVagueSeul('Vague')).toBe('Vague')
    expect(nomVagueSeul('  ')).toBe('')
    expect(nomVagueSeul(null)).toBe('')
  })
})

describe('libelleVague', () => {
  it('n’ajoute pas le mot à un nom qui le contient déjà', () => {
    expect(libelleVague('Vague Novembre')).toBe('Vague Novembre')
    expect(libelleVague('Vague de Décembre')).toBe('Vague de Décembre')
  })

  it('ajoute le mot au nom qui en manque', () => {
    expect(libelleVague('Novembre')).toBe('Vague Novembre')
    expect(libelleVague('Promotion 2026')).toBe('Vague Promotion 2026')
  })

  it('ne rend rien pour un nom absent, plutôt qu’un « Vague » esseulé', () => {
    expect(libelleVague('')).toBe('')
    expect(libelleVague(undefined)).toBe('')
  })
})
