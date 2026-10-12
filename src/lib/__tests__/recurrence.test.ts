import { describe, expect, it } from 'vitest'
import { genererOccurrences, versRRule, preselectionsRecurrence, regleEquivalente, LIMITE_OCCURRENCES_DEFAUT, type RegleRecurrence } from '../recurrence'

const jourLocal = (iso: string) => new Date(`${iso}T18:00:00`)

describe('genererOccurrences — fréquences simples', () => {
  it('tous les jours, bornée par un nombre d’occurrences', () => {
    const regle: RegleRecurrence = { frequence: 'jour', intervalle: 1, fin: { type: 'apres', occurrences: 4 } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-12'))
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'])
  })

  it('un jour sur deux (intervalle 2)', () => {
    const regle: RegleRecurrence = { frequence: 'jour', intervalle: 2, fin: { type: 'apres', occurrences: 3 } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-12'))
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-12', '2026-10-14', '2026-10-16'])
  })

  it('tous les mois, même jour du mois', () => {
    const regle: RegleRecurrence = { frequence: 'mois', intervalle: 1, fin: { type: 'apres', occurrences: 3 } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-12'))
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-12', '2026-11-12', '2026-12-12'])
  })

  it('tous les ans', () => {
    const regle: RegleRecurrence = { frequence: 'an', intervalle: 1, fin: { type: 'apres', occurrences: 2 } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-12'))
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-12', '2027-10-12'])
  })

  it('conserve l’heure de départ sur chaque occurrence', () => {
    const regle: RegleRecurrence = { frequence: 'jour', intervalle: 1, fin: { type: 'apres', occurrences: 2 } }
    const dates = genererOccurrences(regle, new Date('2026-10-12T18:30:00'))
    expect(dates.every((d) => d.getHours() === 18 && d.getMinutes() === 30)).toBe(true)
  })
})

describe('genererOccurrences — hebdomadaire multi-jours', () => {
  it('lundi/mercredi/vendredi depuis un lundi', () => {
    // 2026-10-12 est un lundi.
    const regle: RegleRecurrence = { frequence: 'semaine', intervalle: 1, joursSemaine: [1, 3, 5], fin: { type: 'apres', occurrences: 6 } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-12'))
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-10-12', // lun
      '2026-10-14', // mer
      '2026-10-16', // ven
      '2026-10-19', // lun (semaine suivante)
      '2026-10-21',
      '2026-10-23',
    ])
  })

  it('un jour de la semaine déjà passé au moment du départ n’est jamais généré avant `debut`', () => {
    // 2026-10-14 est un mercredi : « lundi » de cette même semaine (12) précède le départ réel.
    const regle: RegleRecurrence = { frequence: 'semaine', intervalle: 1, joursSemaine: [1, 3], fin: { type: 'apres', occurrences: 3 } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-14'))
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-14', '2026-10-19', '2026-10-21'])
  })

  it('toutes les deux semaines, un seul jour', () => {
    const regle: RegleRecurrence = { frequence: 'semaine', intervalle: 2, joursSemaine: [1], fin: { type: 'apres', occurrences: 3 } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-12'))
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-12', '2026-10-26', '2026-11-09'])
  })
})

describe('genererOccurrences — conditions de fin', () => {
  it('s’arrête à une date de fin incluse', () => {
    const regle: RegleRecurrence = { frequence: 'jour', intervalle: 1, fin: { type: 'le', date: '2026-10-15' } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-12'))
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'])
  })

  it('« jamais » reste plafonnée par la limite de sécurité', () => {
    const regle: RegleRecurrence = { frequence: 'jour', intervalle: 1, fin: { type: 'jamais' } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-12'), 10)
    expect(dates).toHaveLength(10)
  })

  it('utilise la limite par défaut (~3 ans) quand rien n’est précisé', () => {
    const regle: RegleRecurrence = { frequence: 'jour', intervalle: 1, fin: { type: 'jamais' } }
    const dates = genererOccurrences(regle, jourLocal('2026-10-12'))
    expect(dates).toHaveLength(LIMITE_OCCURRENCES_DEFAUT)
  })
})

describe('versRRule', () => {
  it('fréquence simple, sans fin', () => {
    expect(versRRule({ frequence: 'jour', intervalle: 1, fin: { type: 'jamais' } })).toBe('RRULE:FREQ=DAILY')
  })

  it('intervalle supérieur à 1', () => {
    expect(versRRule({ frequence: 'semaine', intervalle: 2, fin: { type: 'jamais' } })).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2')
  })

  it('jours de la semaine, triés et convertis au format iCalendar', () => {
    expect(versRRule({ frequence: 'semaine', intervalle: 1, joursSemaine: [5, 1, 3], fin: { type: 'jamais' } })).toBe(
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
    )
  })

  it('fin après N occurrences', () => {
    expect(versRRule({ frequence: 'jour', intervalle: 1, fin: { type: 'apres', occurrences: 5 } })).toBe('RRULE:FREQ=DAILY;COUNT=5')
  })

  it('fin à une date, encodée en UTC quel que soit le fuseau de la machine qui l’exécute', () => {
    const rrule = versRRule({ frequence: 'jour', intervalle: 1, fin: { type: 'le', date: '2026-12-31' } })
    const until = rrule.match(/UNTIL=(\d{8}T\d{6}Z)/)?.[1]
    expect(until).toBeDefined()
    // Reconstruit l'instant attendu de la même façon (23:59:59 LOCAL le 31/12), pour que le test
    // reste vrai sur une machine UTC comme sur une machine à tout autre fuseau.
    const attendu = new Date('2026-12-31T23:59:59')
    const pad = (n: number) => String(n).padStart(2, '0')
    const attenduFormate = `${attendu.getUTCFullYear()}${pad(attendu.getUTCMonth() + 1)}${pad(attendu.getUTCDate())}T${pad(attendu.getUTCHours())}${pad(attendu.getUTCMinutes())}${pad(attendu.getUTCSeconds())}Z`
    expect(until).toBe(attenduFormate)
  })
})

describe('preselectionsRecurrence', () => {
  it('propose « tous les jours de la semaine » seulement pour un départ en semaine', () => {
    // 2026-10-12 est un lundi.
    const options = preselectionsRecurrence(jourLocal('2026-10-12'))
    expect(options.map((o) => o.valeur)).toContain('semaine_ouvree')

    // 2026-10-17 est un samedi.
    const optionsWeekend = preselectionsRecurrence(jourLocal('2026-10-17'))
    expect(optionsWeekend.map((o) => o.valeur)).not.toContain('semaine_ouvree')
  })

  it('nomme le jour de la semaine réel dans le libellé', () => {
    const options = preselectionsRecurrence(jourLocal('2026-10-12'))
    const hebdo = options.find((o) => o.valeur === 'semaine')
    expect(hebdo?.libelle).toBe('Toutes les semaines le lundi')
  })

  it('« Ne se répète pas » et « Personnalisé… » ne portent aucune règle directe', () => {
    const options = preselectionsRecurrence(jourLocal('2026-10-12'))
    expect(options.find((o) => o.valeur === 'aucune')?.regle).toBeNull()
    expect(options.find((o) => o.valeur === 'personnalise')?.regle).toBeNull()
  })
})

describe('regleEquivalente', () => {
  it('ignore l’ordre des jours de la semaine', () => {
    const a: RegleRecurrence = { frequence: 'semaine', intervalle: 1, joursSemaine: [1, 3, 5], fin: { type: 'jamais' } }
    const b: RegleRecurrence = { frequence: 'semaine', intervalle: 1, joursSemaine: [5, 1, 3], fin: { type: 'jamais' } }
    expect(regleEquivalente(a, b)).toBe(true)
  })

  it('distingue deux fréquences ou deux intervalles différents', () => {
    const base: RegleRecurrence = { frequence: 'semaine', intervalle: 1, fin: { type: 'jamais' } }
    expect(regleEquivalente(base, { ...base, frequence: 'mois' })).toBe(false)
    expect(regleEquivalente(base, { ...base, intervalle: 2 })).toBe(false)
  })

  it('distingue deux conditions de fin différentes', () => {
    const base: RegleRecurrence = { frequence: 'jour', intervalle: 1, fin: { type: 'jamais' } }
    expect(regleEquivalente(base, { ...base, fin: { type: 'apres', occurrences: 5 } })).toBe(false)
    expect(
      regleEquivalente({ ...base, fin: { type: 'le', date: '2026-12-31' } }, { ...base, fin: { type: 'le', date: '2026-12-30' } }),
    ).toBe(false)
  })

  it('reconnaît un préréglage malgré un ordre de jours différent', () => {
    const options = preselectionsRecurrence(jourLocal('2026-10-12'))
    const hebdoOuvree = options.find((o) => o.valeur === 'semaine_ouvree')!.regle!
    const memeRegleOrdreDifferent: RegleRecurrence = { ...hebdoOuvree, joursSemaine: [5, 3, 1, 4, 2] }
    expect(regleEquivalente(hebdoOuvree, memeRegleOrdreDifferent)).toBe(true)
  })
})
