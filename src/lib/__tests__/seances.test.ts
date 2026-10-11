import { describe, expect, it } from 'vitest'
import { estSeanceDuo, inscriptionsVisibles, libelleTypeSeance, nomEleveInscrit } from '../seances'

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

/* Un binôme DUO est une séance 'individuel' à deux inscrits (0054/0008) : seul le lien
   `duo_partenaire_id` permet de le distinguer d'un petit cours collectif. Demande client du
   2026-10-11 : la séance de François Bryan et Malalatiaina ANDRI s'affichait « Individuel ». */

const francois = { id: 'francois', duo_partenaire_id: null }
const malalatiaina = { id: 'malalatiaina', duo_partenaire_id: 'francois' }
const tiers = { id: 'tiers', duo_partenaire_id: null }

describe('estSeanceDuo', () => {
  it('reconnaît deux élèves liés, quel que soit le sens de la lecture', () => {
    expect(estSeanceDuo([{ etudiant: francois }, { etudiant: malalatiaina }])).toBe(true)
    expect(estSeanceDuo([{ etudiant: malalatiaina }, { etudiant: francois }])).toBe(true)
  })

  it('ne confond pas deux élèves qui se trouvent seuls au même cours', () => {
    expect(estSeanceDuo([{ etudiant: francois }, { etudiant: tiers }])).toBe(false)
  })

  it('exige exactement deux inscrits', () => {
    expect(estSeanceDuo([{ etudiant: francois }])).toBe(false)
    expect(estSeanceDuo([{ etudiant: francois }, { etudiant: malalatiaina }, { etudiant: tiers }])).toBe(false)
  })

  it('tolère un inscrit dont le compte a été supprimé', () => {
    expect(estSeanceDuo([{ etudiant: francois }, { etudiant: null }])).toBe(false)
  })
})

describe('libelleTypeSeance', () => {
  it('dit « Duo » pour un binôme, même si la séance est de type individuel', () => {
    expect(libelleTypeSeance('individuel', [{ etudiant: francois }, { etudiant: malalatiaina }])).toBe('Duo')
  })

  it('garde Individuel et Collectif pour les autres cas', () => {
    expect(libelleTypeSeance('individuel', [{ etudiant: francois }])).toBe('Individuel')
    expect(libelleTypeSeance('collectif', [{ etudiant: francois }, { etudiant: tiers }])).toBe('Collectif')
  })
})
