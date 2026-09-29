import { describe, expect, it } from 'vitest'
import { integrationComplete, moyenneSimulation, niveauAuMoins, niveauGlobal, niveauGlobalPropose, testsReussis } from '../recrutement'

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
  it('calcule la moyenne des notes renseignées', () => {
    expect(moyenneSimulation({ preparation: 4, anglais: 5, pedagogie: 3 })).toBe(4)
    expect(moyenneSimulation({})).toBeNull()
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
