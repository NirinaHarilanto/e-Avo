import { describe, expect, it } from 'vitest'
import { nomAvecDuo, nomGroupeDuo } from '../duo'

describe('nomGroupeDuo', () => {
  it('reprend le nom saisi quand il est fourni', () => {
    expect(nomGroupeDuo('Les Rakoto', 'Miora', 'Tojo')).toBe('Les Rakoto')
  })

  it('retombe sur "Prénom1/Prénom2" quand rien n’est saisi', () => {
    expect(nomGroupeDuo(null, 'Miora', 'Tojo')).toBe('Miora/Tojo')
    expect(nomGroupeDuo(undefined, 'Miora', 'Tojo')).toBe('Miora/Tojo')
  })

  it('ignore un nom saisi vide ou uniquement des espaces', () => {
    expect(nomGroupeDuo('   ', 'Miora', 'Tojo')).toBe('Miora/Tojo')
  })
})

describe('nomAvecDuo', () => {
  it('renvoie le nom seul sans partenaire', () => {
    expect(nomAvecDuo({ prenom: 'Sandra', nom: 'Ramavoharisoa' }, null)).toBe('Sandra Ramavoharisoa')
  })

  it('accole le nom du partenaire avec « & »', () => {
    expect(nomAvecDuo({ prenom: 'Sandra', nom: 'Ramavoharisoa' }, { prenom: 'Bensas', nom: 'Rakotonjanahary' })).toBe(
      'Sandra Ramavoharisoa & Bensas Rakotonjanahary',
    )
  })

  it('tolère un prénom ou nom manquant des deux côtés', () => {
    expect(nomAvecDuo({ prenom: null, nom: 'Ramavoharisoa' }, { prenom: 'Bensas', nom: null })).toBe('Ramavoharisoa & Bensas')
  })
})
