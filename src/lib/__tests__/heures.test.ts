import { describe, expect, it } from 'vitest'
import { formaterHeures, formaterMinutes } from '../heures'

describe('formaterHeures', () => {
  it('omet les minutes quand elles sont nulles', () => {
    expect(formaterHeures(2)).toBe('2h')
  })

  it('omet les heures quand il n’y en a pas', () => {
    expect(formaterHeures(0.75)).toBe('45m')
  })

  it('affiche les deux quand les deux existent', () => {
    expect(formaterHeures(1.5)).toBe('1h 30m')
    expect(formaterHeures(7.25)).toBe('7h 15m')
  })

  it('traite l’absence de valeur comme zéro', () => {
    expect(formaterHeures(null)).toBe('0h')
    expect(formaterHeures(undefined)).toBe('0h')
    expect(formaterHeures(0)).toBe('0h')
  })

  /* Les compteurs viennent de sommes de durées en minutes divisées par 60 : 1/3 d'heure ne
     tombe jamais juste en décimal. L'arrondi se fait à la minute, pas à l'heure. */
  it('arrondit à la minute', () => {
    expect(formaterHeures(1 / 3)).toBe('20m')
    expect(formaterHeures(0.999)).toBe('1h')
  })

  it('convertit depuis des minutes', () => {
    expect(formaterMinutes(90)).toBe('1h 30m')
    expect(formaterMinutes(45)).toBe('45m')
  })
})
