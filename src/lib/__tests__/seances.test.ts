import { describe, expect, it } from 'vitest'
import { inscriptionsVisibles, nomEleveInscrit, seanceAVenir } from '../seances'

const DEMAIN = new Date(Date.now() + 86_400_000).toISOString()
const HIER = new Date(Date.now() - 86_400_000).toISOString()

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

describe('seanceAVenir', () => {
  it('ne retient que les séances encore planifiées et pas encore passées', () => {
    expect(seanceAVenir({ debut: DEMAIN, statut: 'planifiee' })).toBe(true)
    expect(seanceAVenir({ debut: HIER, statut: 'planifiee' })).toBe(false)
    expect(seanceAVenir({ debut: DEMAIN, statut: 'annulee' })).toBe(false)
  })
})

describe('inscriptionsVisibles', () => {
  const futur = { debut: DEMAIN, statut: 'planifiee' }
  const passe = { debut: HIER, statut: 'terminee' }

  it('laisse l’historique intact, élèves supprimés compris', () => {
    const inscriptions = [{ etudiant: null }, { etudiant: { id: 'a' } }]
    expect(inscriptionsVisibles(passe, inscriptions)).toHaveLength(2)
  })

  it('retire un élève supprimé d’une séance à venir', () => {
    const inscriptions = [{ etudiant: null }, { etudiant: { id: 'a' } }]
    expect(inscriptionsVisibles(futur, inscriptions)).toEqual([{ etudiant: { id: 'a' } }])
  })

  it('masque la séance à venir dont tous les inscrits ont été supprimés', () => {
    expect(inscriptionsVisibles(futur, [{ etudiant: null }])).toBeNull()
  })

  it('garde une séance à venir volontairement créée sans inscrit', () => {
    expect(inscriptionsVisibles(futur, [])).toEqual([])
  })
})
