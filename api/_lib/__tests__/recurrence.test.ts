import { describe, expect, it } from 'vitest'
import { decrireRecurrence } from '../google.js'

/* La phrase doit se lire comme celle du pop-up de Google Agenda, que le client a pris en
   référence : « Toutes les semaines le lundi, mardi, jeudi, vendredi, jusqu'au 14 nov. 2026 ». */
describe('decrireRecurrence', () => {
  it('rend la série hebdomadaire de la capture client', () => {
    expect(decrireRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,TH,FR;UNTIL=20261114T210000Z'])).toBe(
      "Toutes les semaines le lundi, mardi, jeudi, vendredi, jusqu'au 14 nov. 2026",
    )
  })

  it('rend une répétition quotidienne sans fin', () => {
    expect(decrireRecurrence(['RRULE:FREQ=DAILY'])).toBe('Tous les jours')
  })

  it('exprime un intervalle supérieur à un', () => {
    expect(decrireRecurrence(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'])).toBe('Toutes les 2 semaines le lundi')
  })

  it('exprime une fin par nombre d’occurrences', () => {
    expect(decrireRecurrence(['RRULE:FREQ=MONTHLY;COUNT=6'])).toBe('Tous les mois, 6 fois')
  })

  it('ignore les lignes qui ne sont pas une RRULE', () => {
    expect(decrireRecurrence(['EXDATE;TZID=Indian/Antananarivo:20261012T073000'])).toBeNull()
    expect(decrireRecurrence([])).toBeNull()
  })

  /* Une règle qu'on ne sait pas traduire ne doit pas produire une phrase fausse : la date de fin
     d'une série est une information sur laquelle on ne peut pas se permettre d'approximation. */
  it('retombe sur une mention générique pour une fréquence inconnue', () => {
    expect(decrireRecurrence(['RRULE:FREQ=HOURLY;INTERVAL=3'])).toBe('Se répète')
  })

  it('tolère un BYDAY positionnel (deuxième mardi du mois)', () => {
    expect(decrireRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=2TU'])).toBe('Toutes les semaines le mardi')
  })
})
