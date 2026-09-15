import { describe, expect, it } from 'vitest'
import { calculerCreneauxLibres, grouperParJour, instantDepuisLocal, partiesLocales } from '../creneaux'

const FUSEAU = 'Indian/Antananarivo'

const PARAMETRES = {
  dureeMinutes: 15,
  delaiMinimumHeures: 12,
  horizonJours: 7,
  pauseMinutes: 0,
  fuseau: FUSEAU,
}

/* Lundi 14 septembre 2026, 6h00 à Antananarivo (UTC+3). */
const LUNDI_6H = new Date('2026-09-14T03:00:00.000Z')

const PLAGE_LUNDI_MATIN = [{ jour_semaine: 1, heure_debut: '09:00:00', heure_fin: '10:00:00' }]

describe('instantDepuisLocal', () => {
  it('convertit une heure malgache en instant UTC', () => {
    // Madagascar est à UTC+3 toute l'année : 9h locales = 6h UTC.
    expect(instantDepuisLocal(2026, 9, 14, 9, 0, FUSEAU).toISOString()).toBe('2026-09-14T06:00:00.000Z')
  })

  it('suit le changement d’heure des fuseaux qui en ont un', () => {
    // Paris : UTC+2 en août (heure d’été), UTC+1 en décembre.
    expect(instantDepuisLocal(2026, 8, 15, 12, 0, 'Europe/Paris').toISOString()).toBe('2026-08-15T10:00:00.000Z')
    expect(instantDepuisLocal(2026, 12, 15, 12, 0, 'Europe/Paris').toISOString()).toBe('2026-12-15T11:00:00.000Z')
  })
})

describe('partiesLocales', () => {
  it('rend la date telle qu’elle se lit dans le fuseau', () => {
    // 23h UTC le dimanche = 2h du matin le lundi à Antananarivo : c’est bien lundi (1) qu’il faut lire.
    const p = partiesLocales(new Date('2026-09-13T23:00:00.000Z'), FUSEAU)
    expect({ jour: p.jour, heures: p.heures, jourSemaine: p.jourSemaine }).toEqual({ jour: 14, heures: 2, jourSemaine: 1 })
  })
})

describe('calculerCreneauxLibres', () => {
  it('découpe une plage en créneaux de la durée demandée', () => {
    const creneaux = calculerCreneauxLibres(PLAGE_LUNDI_MATIN, [], { ...PARAMETRES, delaiMinimumHeures: 0 }, LUNDI_6H)
    const duJour = creneaux.filter((c) => c.startsWith('2026-09-14'))
    expect(duJour).toEqual([
      '2026-09-14T06:00:00.000Z',
      '2026-09-14T06:15:00.000Z',
      '2026-09-14T06:30:00.000Z',
      '2026-09-14T06:45:00.000Z',
    ])
  })

  it('ne propose jamais un créneau qui dépasserait la fin de la plage', () => {
    const creneaux = calculerCreneauxLibres(
      [{ jour_semaine: 1, heure_debut: '09:00', heure_fin: '09:50' }],
      [],
      { ...PARAMETRES, delaiMinimumHeures: 0, horizonJours: 1 },
      LUNDI_6H,
    )
    // 9h50 - 9h00 = 50 min : trois créneaux de 15 min, le quatrième déborderait.
    expect(creneaux).toHaveLength(3)
  })

  it('respecte le délai minimum de réservation', () => {
    // À 6h du matin avec 12 h de délai, plus rien n’est réservable avant 18h : la plage du matin saute.
    const creneaux = calculerCreneauxLibres(PLAGE_LUNDI_MATIN, [], PARAMETRES, LUNDI_6H)
    expect(creneaux.filter((c) => c.startsWith('2026-09-14'))).toEqual([])
    // La semaine suivante reste proposée.
    expect(creneaux.some((c) => c.startsWith('2026-09-21'))).toBe(true)
  })

  it('retire les créneaux occupés par un rendez-vous ou l’agenda Google', () => {
    const occupations = [{ debut: '2026-09-14T06:15:00.000Z', fin: '2026-09-14T06:30:00.000Z' }]
    const creneaux = calculerCreneauxLibres(
      PLAGE_LUNDI_MATIN,
      occupations,
      { ...PARAMETRES, delaiMinimumHeures: 0, horizonJours: 1 },
      LUNDI_6H,
    )
    expect(creneaux).not.toContain('2026-09-14T06:15:00.000Z')
    expect(creneaux).toContain('2026-09-14T06:30:00.000Z')
  })

  it('élargit l’occupation de la pause configurée', () => {
    const occupations = [{ debut: '2026-09-14T06:15:00.000Z', fin: '2026-09-14T06:30:00.000Z' }]
    const creneaux = calculerCreneauxLibres(
      PLAGE_LUNDI_MATIN,
      occupations,
      { ...PARAMETRES, delaiMinimumHeures: 0, horizonJours: 1, pauseMinutes: 15 },
      LUNDI_6H,
    )
    /* 6h00-6h15 finit pile quand l'occupation commence : avec 15 min de pause exigées, il tombe
       aussi. 6h45 démarre exactement à la fin de la pause, il reste donc proposable. */
    expect(creneaux).toEqual(['2026-09-14T06:45:00.000Z'])
  })

  it('ignore les plages désactivées', () => {
    const creneaux = calculerCreneauxLibres(
      [{ ...PLAGE_LUNDI_MATIN[0], actif: false }],
      [],
      { ...PARAMETRES, delaiMinimumHeures: 0 },
      LUNDI_6H,
    )
    expect(creneaux).toEqual([])
  })

  it('ne propose rien au-delà de l’horizon', () => {
    const creneaux = calculerCreneauxLibres(
      PLAGE_LUNDI_MATIN,
      [],
      { ...PARAMETRES, delaiMinimumHeures: 0, horizonJours: 3 },
      LUNDI_6H,
    )
    // Seul le lundi du jour même tombe dans les 3 jours ; le lundi suivant est hors horizon.
    expect(creneaux.every((c) => c.startsWith('2026-09-14'))).toBe(true)
  })
})

describe('grouperParJour', () => {
  it('regroupe par date locale et non par date UTC', () => {
    // 22h UTC = 1h du matin le lendemain à Antananarivo : les deux créneaux sont deux jours différents.
    const groupes = grouperParJour(['2026-09-14T20:00:00.000Z', '2026-09-14T22:00:00.000Z'], FUSEAU)
    expect(groupes.map((g) => g.date)).toEqual(['2026-09-14', '2026-09-15'])
  })
})
