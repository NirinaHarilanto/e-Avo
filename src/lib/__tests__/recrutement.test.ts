import { describe, expect, it } from 'vitest'
import {
  integrationComplete,
  niveauAuMoins,
  niveauGlobal,
  niveauGlobalPropose,
  resultatSimulation,
  testsReussis,
  TOTAL_SIMULATION_REQUIS,
} from '../recrutement'

describe('tests d’anglais des formateurs', () => {
  it('exige C1 au minimum', () => {
    expect(niveauAuMoins('C1')).toBe(true)
    expect(niveauAuMoins('C2')).toBe(true)
    expect(niveauAuMoins('B2')).toBe(false)
    expect(niveauAuMoins(null)).toBe(false)
  })

  it('propose le plus faible des trois niveaux comme niveau global', () => {
    const tests = {
      reading: { fait: true, niveau: 'C2' as const },
      listening: { fait: true, niveau: 'B2' as const },
      grammar_vocabulary: { fait: true, niveau: 'C1' as const },
    }
    expect(niveauGlobalPropose(tests)).toBe('B2')
    expect(testsReussis(tests)).toBe(false)
  })

  it('attend les trois tests avant de proposer un niveau global', () => {
    expect(niveauGlobalPropose({ reading: { fait: true, niveau: 'C1' } })).toBeNull()
  })

  it('laisse l’admin trancher le niveau global', () => {
    const tests = {
      reading: { fait: true, niveau: 'C1' as const },
      listening: { fait: true, niveau: 'B2' as const },
      grammar_vocabulary: { fait: true, niveau: 'C1' as const },
      niveau_global: 'C1' as const,
    }
    expect(niveauGlobal(tests)).toBe('C1')
    expect(testsReussis(tests)).toBe(true)
  })

  it('ne valide pas des tests non passés même avec un niveau saisi', () => {
    expect(
      testsReussis({
        reading: { fait: false, niveau: 'C2' },
        listening: { fait: true, niveau: 'C2' },
        grammar_vocabulary: { fait: true, niveau: 'C2' },
      }),
    ).toBe(false)
  })
})

describe('simulation et intégration', () => {
  /* Grille officielle (document « HOC_Grille_evaluation_simulation », 2026-10-01) : « un candidat
     est validé à partir de 14/20, sans aucun critère noté 1 ». Les deux conditions sont testées
     séparément — c'est la seconde qui se perd le plus facilement en refactorisant. */
  const grille = (notes: number[]) => ({
    delivrance: notes[0],
    oral: notes[1],
    stress: notes[2],
    activites: notes[3],
    methode_hoc: notes[4],
  })

  it('ne donne aucun total tant que les cinq critères ne sont pas notés', () => {
    const partiel = resultatSimulation({ delivrance: 4, oral: 4 })
    expect(partiel.complete).toBe(false)
    expect(partiel.total).toBeNull()
    expect(partiel.valide).toBe(false)
  })

  it('valide à partir du seuil quand aucun critère n’est bloquant', () => {
    const juste = resultatSimulation(grille([3, 3, 3, 3, 2]))
    expect(juste.total).toBe(TOTAL_SIMULATION_REQUIS)
    expect(juste.valide).toBe(true)
    expect(resultatSimulation(grille([4, 4, 4, 4, 4])).valide).toBe(true)
  })

  it('refuse juste en dessous du seuil', () => {
    const dessous = resultatSimulation(grille([3, 3, 3, 2, 2]))
    expect(dessous.total).toBe(TOTAL_SIMULATION_REQUIS - 1)
    expect(dessous.valide).toBe(false)
    expect(dessous.critereBloquant).toBeNull()
  })

  it('refuse un critère noté 1 même avec un très bon total, et dit lequel', () => {
    const bloque = resultatSimulation(grille([4, 4, 4, 4, 1]))
    expect(bloque.total).toBe(17)
    expect(bloque.valide).toBe(false)
    expect(bloque.critereBloquant).toContain('Méthode HOC')
  })

  it('exige le contrat signé et toutes les étapes d’onboarding', () => {
    const etapes = {
      onboarding_outils: { fait: true },
      observation_collectif: { fait: true },
      onboarding_pedagogie: { fait: true },
      guide_formateur: { fait: true },
    }
    expect(integrationComplete(etapes, true)).toBe(true)
    expect(integrationComplete(etapes, false)).toBe(false)
    expect(integrationComplete({ ...etapes, guide_formateur: { fait: false } }, true)).toBe(false)
  })
})
