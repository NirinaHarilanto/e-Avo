import { describe, expect, it } from 'vitest'
import { genererOccurrences, versRRule, preselectionsRecurrence, regleEquivalente, finParDefaut, aPlusieursCreneauxParJour, LIMITE_OCCURRENCES_DEFAUT, type RegleRecurrence } from '../recurrence'

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

/* Garde-fous posés après l'incident du 2026-11-03 : « Tous les jours » sans date de fin a créé
   156 séances d'un coup, et une réservation relancée quatre fois a laissé 107 séances fantômes
   dans le dossier d'une élève. Voir [[reference_doublons_seances_recurrentes]]. */
describe('heure propre à chaque jour de la semaine', () => {
  it('applique l’heure définie pour chaque jour coché', () => {
    const regle: RegleRecurrence = {
      frequence: 'semaine',
      intervalle: 1,
      joursSemaine: [1, 3],
      heuresParJour: { 1: ['10:00'], 3: ['14:30'] },
      fin: { type: 'apres', occurrences: 4 },
    }
    // Lundi 2 novembre 2026, 8h — l'heure de départ ne doit PAS l'emporter sur celle des jours.
    const dates = genererOccurrences(regle, new Date(2026, 10, 2, 8, 0))
    expect(dates.map((d) => `${d.getDay()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`)).toEqual([
      '1 10:00',
      '3 14:30',
      '1 10:00',
      '3 14:30',
    ])
  })

  it('garde l’heure de départ pour un jour sans heure propre', () => {
    const regle: RegleRecurrence = {
      frequence: 'semaine',
      intervalle: 1,
      joursSemaine: [1, 3],
      heuresParJour: { 1: ['10:00'] },
      fin: { type: 'apres', occurrences: 2 },
    }
    const dates = genererOccurrences(regle, new Date(2026, 10, 2, 8, 15))
    expect(dates[0].getHours()).toBe(10)
    // Mercredi n'a pas d'heure propre : il hérite de 8h15, l'ancien comportement.
    expect(`${dates[1].getHours()}:${dates[1].getMinutes()}`).toBe('8:15')
  })
})

describe('préréglages bornés par défaut', () => {
  it('aucun préréglage ne part sur une récurrence sans fin', () => {
    const options = preselectionsRecurrence(new Date(2026, 10, 2, 8, 0))
    const avecRegle = options.filter((o) => o.regle)
    expect(avecRegle.length).toBeGreaterThan(0)
    expect(avecRegle.every((o) => o.regle!.fin.type === 'le')).toBe(true)
  })

  it('« tous les jours » produit une série bornée, pas le plafond de 156', () => {
    const debut = new Date(2026, 10, 2, 8, 0)
    const quotidien = preselectionsRecurrence(debut).find((o) => o.valeur === 'jour')!
    const dates = genererOccurrences(quotidien.regle!, debut)
    expect(dates.length).toBeLessThan(LIMITE_OCCURRENCES_DEFAUT)
    // Trois mois de quotidien : de l'ordre de 90 jours, jamais 156.
    expect(dates.length).toBeGreaterThan(80)
    expect(dates.length).toBeLessThan(100)
  })

  it('finParDefaut tombe trois mois après le départ', () => {
    expect(finParDefaut(new Date(2026, 10, 3, 5, 45))).toEqual({ type: 'le', date: '2027-02-03' })
  })
})

describe('plusieurs créneaux le même jour', () => {
  it('crée une occurrence par créneau, en ordre chronologique', () => {
    const regle: RegleRecurrence = {
      frequence: 'semaine',
      intervalle: 1,
      joursSemaine: [1],
      // Saisis dans le désordre : la sortie doit rester chronologique.
      heuresParJour: { 1: ['18:00', '06:15'] },
      fin: { type: 'apres', occurrences: 4 },
    }
    const dates = genererOccurrences(regle, new Date(2026, 10, 2, 0, 0))
    expect(dates.map((d) => `${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`)).toEqual([
      '2 6:15',
      '2 18:00',
      '9 6:15',
      '9 18:00',
    ])
  })

  it('compte chaque créneau dans la limite d’occurrences', () => {
    const regle: RegleRecurrence = {
      frequence: 'semaine',
      intervalle: 1,
      joursSemaine: [1],
      heuresParJour: { 1: ['06:15', '18:00'] },
      fin: { type: 'apres', occurrences: 3 },
    }
    expect(genererOccurrences(regle, new Date(2026, 10, 2, 0, 0))).toHaveLength(3)
  })

  it('signale une règle que RRULE ne sait pas transporter', () => {
    const base: RegleRecurrence = { frequence: 'semaine', intervalle: 1, joursSemaine: [1], fin: { type: 'jamais' } }
    expect(aPlusieursCreneauxParJour({ ...base, heuresParJour: { 1: ['06:15'] } })).toBe(false)
    expect(aPlusieursCreneauxParJour({ ...base, heuresParJour: { 1: ['06:15', '18:00'] } })).toBe(true)
  })
})
