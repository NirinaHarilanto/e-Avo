import { describe, expect, it } from 'vitest'
import { formaterHeures, formaterMinutes, totalHeuresCumulees, heuresRestantes } from '../heures'

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

/* Demande client du 2026-10-10 : un forfait ajouté en prolongation d'un précédent encore en
   cours doit cumuler ses heures avec celles qui restaient — jamais les remplacer. Bug réel trouvé
   dans DossierEtudiantVue.tsx : la jauge « Heures suivies » ne regardait que le dernier forfait
   souscrit (`forfait.total_heures`) plutôt que la somme de tous (`totalHeuresCumulees`), affichant
   par exemple « 18 / 10 h » (> 100 %) pour un élève ayant consommé 18 h sur un forfait de 20 h
   puis prolongé de 10 h, au lieu de « 18 / 30 h ». */
describe('totalHeuresCumulees', () => {
  it('additionne les heures de tous les forfaits', () => {
    expect(totalHeuresCumulees([{ total_heures: 20 }, { total_heures: 10 }])).toBe(30)
  })

  it('vaut 0 sans aucun forfait', () => {
    expect(totalHeuresCumulees([])).toBe(0)
  })

  it('ne compte pas que le dernier forfait souscrit', () => {
    // Le bug exact constaté : un seul forfait pris en compte plutôt que la somme.
    const packages = [{ total_heures: 10 }, { total_heures: 20 }]
    expect(totalHeuresCumulees(packages)).not.toBe(packages[0].total_heures)
    expect(totalHeuresCumulees(packages)).toBe(30)
  })
})

describe('heuresRestantes', () => {
  it('cumule les forfaits avant de soustraire les heures consommées', () => {
    // 18 h consommées sur 20 h, puis +10 h de prolongation : 12 h restantes, pas -8 h.
    expect(heuresRestantes([{ total_heures: 20 }, { total_heures: 10 }], 18)).toBe(12)
  })

  it('ne descend jamais sous zéro', () => {
    expect(heuresRestantes([{ total_heures: 10 }], 15)).toBe(0)
  })

  it('vaut le total cumulé sans aucune heure consommée', () => {
    expect(heuresRestantes([{ total_heures: 20 }, { total_heures: 10 }], 0)).toBe(30)
  })
})
