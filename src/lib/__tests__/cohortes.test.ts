import { describe, expect, it } from 'vitest'
import { libelleVague, nomVagueSeul, trierVaguesParProximite } from '../cohortes'

/* Tri des vagues par proximité à aujourd'hui (demande client du 2026-10-10) — fige la date de
   référence à une valeur connue dans chaque test, pour un résultat indépendant du jour où la
   suite tourne. */
const AUJOURDHUI = new Date('2026-10-10T14:00:00Z')

function vague(id: string, dateDebut: string, dateFin = dateDebut) {
  return { id, date_debut: dateDebut, date_fin: dateFin }
}

describe('trierVaguesParProximite', () => {
  it('place la vague la plus proche d’aujourd’hui en premier, qu’elle soit passée ou future', () => {
    // Écarts à AUJOURDHUI (2026-10-10), volontairement ronds pour rester vérifiables à l'œil :
    // dans-une-semaine +7j, recemment-passee -20j, loin-dans-le-passe -70j, loin-dans-le-futur +80j.
    const resultat = trierVaguesParProximite(
      [
        vague('loin-dans-le-passe', '2026-08-01'),
        vague('dans-une-semaine', '2026-10-17'),
        vague('loin-dans-le-futur', '2026-12-29'),
        vague('recemment-passee', '2026-09-20'),
      ],
      AUJOURDHUI,
    )
    expect(resultat.map((v) => v.id)).toEqual(['dans-une-semaine', 'recemment-passee', 'loin-dans-le-passe', 'loin-dans-le-futur'])
  })

  it('une vague future peut passer devant une vague passée si elle est chronologiquement plus proche', () => {
    // À 3 jours égale distance de chaque côté : la future doit l'emporter à distance strictement
    // inférieure, pas à distance égale — ce cas-ci vérifie la distance strictement inférieure.
    const resultat = trierVaguesParProximite(
      [vague('future-2-jours', '2026-10-12'), vague('passee-5-jours', '2026-10-05')],
      AUJOURDHUI,
    )
    expect(resultat.map((v) => v.id)).toEqual(['future-2-jours', 'passee-5-jours'])
  })

  it('la vague qui démarre aujourd’hui même est toujours en tête', () => {
    const resultat = trierVaguesParProximite(
      [vague('future', '2026-11-01'), vague('aujourdhui', '2026-10-10'), vague('passee', '2026-09-01')],
      AUJOURDHUI,
    )
    expect(resultat[0].id).toBe('aujourdhui')
  })

  it('départage une égalité de date de début par la date de fin la plus proche', () => {
    const resultat = trierVaguesParProximite(
      [vague('longue', '2026-11-01', '2027-03-01'), vague('courte', '2026-11-01', '2026-12-15')],
      AUJOURDHUI,
    )
    expect(resultat.map((v) => v.id)).toEqual(['courte', 'longue'])
  })

  it('ne modifie pas le tableau d’origine (nouvelle référence)', () => {
    const original = [vague('a', '2026-12-01'), vague('b', '2026-10-11')]
    const resultat = trierVaguesParProximite(original, AUJOURDHUI)
    expect(resultat).not.toBe(original)
    expect(original.map((v) => v.id)).toEqual(['a', 'b'])
  })

  it('une liste vide reste vide', () => {
    expect(trierVaguesParProximite([], AUJOURDHUI)).toEqual([])
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
