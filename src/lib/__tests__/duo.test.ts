import { describe, expect, it } from 'vitest'
import { nomAvecDuo, nomGroupeDuo, sansSecondairesDuo } from '../duo'

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

describe('sansSecondairesDuo', () => {
  const principal = { id: 'francois', duo_partenaire_id: null }
  const secondaire = { id: 'malalatiaina', duo_partenaire_id: 'francois' }
  const isole = { id: 'miary', duo_partenaire_id: null }

  it('retire le secondaire quand son principal est dans la liste', () => {
    expect(sansSecondairesDuo([principal, secondaire, isole]).map((p) => p.id)).toEqual(['francois', 'miary'])
  })

  it('ne retire jamais le principal, qui ne porte pas duo_partenaire_id (lien asymétrique, 0054)', () => {
    expect(sansSecondairesDuo([principal, secondaire]).map((p) => p.id)).toEqual(['francois'])
  })

  it('garde un secondaire dont le principal est absent de la liste', () => {
    expect(sansSecondairesDuo([secondaire, isole]).map((p) => p.id)).toEqual(['malalatiaina', 'miary'])
  })

  it('ne touche pas une liste sans aucun duo', () => {
    expect(sansSecondairesDuo([principal, isole]).map((p) => p.id)).toEqual(['francois', 'miary'])
  })

  it('renvoie une liste vide pour une liste vide', () => {
    expect(sansSecondairesDuo([])).toEqual([])
  })
})
