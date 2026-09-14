import { describe, expect, it } from 'vitest'
import { memeNom, nomComplet, normaliserNom } from '../nomDuplique'

describe('normaliserNom', () => {
  it('ignore casse, accents et espaces superflus', () => {
    expect(normaliserNom('  RAKOTONJANAHARY ')).toBe('rakotonjanahary')
    expect(normaliserNom('Rasoanaïvo')).toBe('rasoanaivo')
    expect(normaliserNom('Jean   Pierre')).toBe('jean pierre')
  })

  it('traite tirets, apostrophes et points comme des espaces', () => {
    expect(normaliserNom('Jean-Pierre')).toBe(normaliserNom('Jean Pierre'))
    expect(normaliserNom("N'Diaye")).toBe(normaliserNom('N Diaye'))
    expect(normaliserNom('J.P.')).toBe(normaliserNom('J P'))
  })

  it('accepte les valeurs absentes', () => {
    expect(normaliserNom(null)).toBe('')
    expect(normaliserNom(undefined)).toBe('')
  })
})

describe('memeNom', () => {
  it('reconnaît la même personne malgré la saisie', () => {
    expect(memeNom({ prenom: 'Jean-Pierre', nom: 'RAKOTO' }, { prenom: 'jean pierre', nom: 'Rakoto' })).toBe(true)
    expect(memeNom({ prenom: 'Hery', nom: 'Rasoanaïvo' }, { prenom: 'HERY', nom: 'Rasoanaivo' })).toBe(true)
  })

  it('distingue deux personnes différentes', () => {
    expect(memeNom({ prenom: 'Jean', nom: 'Rakoto' }, { prenom: 'Jean', nom: 'Rakotoarisoa' })).toBe(false)
    expect(memeNom({ prenom: 'Jean', nom: 'Rakoto' }, { prenom: 'Paul', nom: 'Rakoto' })).toBe(false)
  })

  it('ne bloque jamais sur une fiche incomplète', () => {
    // Deux fiches sans prénom ne sont pas des doublons l'une de l'autre : ce serait bloquer
    // toutes les fiches partielles entre elles.
    expect(memeNom({ prenom: null, nom: 'Rakoto' }, { prenom: null, nom: 'Rakoto' })).toBe(false)
    expect(memeNom({ prenom: '  ', nom: 'Rakoto' }, { prenom: 'Jean', nom: 'Rakoto' })).toBe(false)
  })
})

describe('nomComplet', () => {
  it('assemble prénom et nom sans espace parasite', () => {
    expect(nomComplet({ prenom: 'Jean', nom: 'Rakoto' })).toBe('Jean Rakoto')
    expect(nomComplet({ prenom: null, nom: 'Rakoto' })).toBe('Rakoto')
  })
})
