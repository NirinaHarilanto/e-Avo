import { describe, expect, it } from 'vitest'
import { nomGroupeDuo } from '../duo'

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
