import { describe, expect, it } from 'vitest'
import { homonymeBloquant, memeNom, nomComplet, normaliserNom } from '../nomDuplique'

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

/* Deux blocages « fantôme » signalés par le client, le même jour, à deux endroits différents :
   une inscription publique refusée au nom d'un prospect dont le compte était supprimé, puis un
   élève bien actif incapable d'enregistrer SA PROPRE fiche (« bernard bensas existe déjà dans
   cet établissement ») à cause d'un homonyme supprimé. La règle vivait en double — routes `api/`
   d'un côté, navigateur de l'autre — et la seconde copie avait oublié les comptes supprimés.
   Elle n'existe plus qu'ici. */
describe('homonymeBloquant', () => {
  const actif = { id: 'actif', nom: 'bensas', prenom: 'bernard', status: 'approved' }
  const supprime = { id: 'supprime', nom: 'bensas', prenom: 'bernard', status: 'suspended' }

  it('bloque un homonyme bien actif', () => {
    expect(homonymeBloquant([actif], { nom: 'bernard', prenom: 'bensas' })).toBeNull()
    expect(homonymeBloquant([actif], { nom: 'bensas', prenom: 'bernard' })).toMatchObject({ id: 'actif' })
  })

  it('ignore un compte supprimé, qui n’apparaît nulle part ailleurs', () => {
    expect(homonymeBloquant([supprime], { nom: 'bensas', prenom: 'bernard' })).toBeNull()
  })

  it('ne bloque jamais une personne sur sa propre fiche', () => {
    expect(homonymeBloquant([actif], { nom: 'bensas', prenom: 'bernard', exclureId: 'actif' })).toBeNull()
  })

  it('bloque toujours un vrai homonyme quand on modifie sa propre fiche', () => {
    expect(homonymeBloquant([actif, { ...actif, id: 'autre' }], { nom: 'bensas', prenom: 'bernard', exclureId: 'actif' })).toMatchObject({
      id: 'autre',
    })
  })

  it('ignore accents, casse et tirets, comme memeNom', () => {
    expect(homonymeBloquant([{ id: 'x', nom: 'BENSAS', prenom: 'Bernard', status: 'approved' }], { nom: 'bensas', prenom: 'bernard' })).toMatchObject({
      id: 'x',
    })
  })

  it('ne bloque pas sur une fiche au nom incomplet', () => {
    expect(homonymeBloquant([{ id: 'y', nom: '', prenom: '', status: 'approved' }], { nom: '', prenom: '' })).toBeNull()
  })
})
