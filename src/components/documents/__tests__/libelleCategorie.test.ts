import { describe, expect, it } from 'vitest'
import { libelleCategorie } from '../UploaderDocument'

/* Catégories de document personnalisées (0109, demande client du 2026-10-10). En base, une
   catégorie personnalisée reste `categorie: 'autre'` — c'est `categorie_libre` qui porte le vrai
   nom choisi par l'admin. Ces tests fixent la règle d'affichage : le libellé personnalisé prime
   sur « Autre » quand il existe, et les huit catégories fixes ne sont jamais affectées. */
describe('libelleCategorie', () => {
  it('affiche le libellé personnalisé pour une catégorie « autre » avec étiquette', () => {
    expect(libelleCategorie({ categorie: 'autre', categorie_libre: 'Permis de conduire' })).toBe('Permis de conduire')
  })

  it('retombe sur « Autre » quand aucune étiquette personnalisée n’est posée', () => {
    expect(libelleCategorie({ categorie: 'autre', categorie_libre: null })).toBe('Autre')
  })

  it('ignore categorie_libre pour les huit catégories fixes', () => {
    expect(libelleCategorie({ categorie: 'contrat', categorie_libre: 'Ne devrait jamais apparaître' })).toBe('Contrat')
    expect(libelleCategorie({ categorie: 'confidentiel', categorie_libre: null })).toBe('Confidentiel')
  })
})
