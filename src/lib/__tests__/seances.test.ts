import { describe, expect, it } from 'vitest'
import { inscriptionsVisibles, nomEleveInscrit } from '../seances'

describe('nomEleveInscrit', () => {
  it('nomme explicitement un élève dont le profil n’est plus résoluble', () => {
    expect(nomEleveInscrit(null)).toBe('Élève supprimé')
    expect(nomEleveInscrit(undefined)).toBe('Élève supprimé')
  })

  it('tolère un nom ou un prénom manquant', () => {
    expect(nomEleveInscrit({ prenom: 'Sandra', nom: null })).toBe('Sandra')
    expect(nomEleveInscrit({ prenom: null, nom: 'Bensas' })).toBe('Bensas')
  })
})

describe('inscriptionsVisibles', () => {
  /* Revu le 2026-09-23 : un compte supprimé ne doit plus laisser aucune trace visible, y
     compris dans l'historique — plus de distinction passé/avenir (voir le commentaire de la
     fonction). */
  it('retire un élève supprimé, y compris d’une séance déjà passée', () => {
    const inscriptions = [{ etudiant: null }, { etudiant: { id: 'a' } }]
    expect(inscriptionsVisibles(inscriptions)).toEqual([{ etudiant: { id: 'a' } }])
  })

  it('masque la séance dont tous les inscrits ont été supprimés', () => {
    expect(inscriptionsVisibles([{ etudiant: null }])).toBeNull()
  })

  it('garde une séance volontairement créée sans inscrit', () => {
    expect(inscriptionsVisibles([])).toEqual([])
  })
})
