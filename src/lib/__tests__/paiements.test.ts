import { describe, expect, it } from 'vitest'
import { acompteSuggere, resteAPayer, statutReglement } from '../paiements'

describe('statutReglement', () => {
  it('affiche « À payer » tant que rien n’a été encaissé', () => {
    expect(statutReglement({ montant: 100, montant_regle: 0, statut: 'attendu' })).toBe('a_payer')
  })

  it('affiche « Payé partiellement » dès le premier acompte', () => {
    expect(statutReglement({ montant: 100, montant_regle: 30, statut: 'attendu' })).toBe('partiel')
  })

  it('affiche « Payé » quand le cumul atteint le montant dû, même si le statut en base a pris du retard', () => {
    expect(statutReglement({ montant: 100, montant_regle: 100, statut: 'attendu' })).toBe('paye')
  })

  it('reste « Payé » pour une ligne soldée en une fois, sans acompte détaillé', () => {
    expect(statutReglement({ montant: 100, montant_regle: 0, statut: 'paye' })).toBe('paye')
  })

  it('préfère « Payé partiellement » à « En retard » : le reste dû est l’information utile', () => {
    expect(statutReglement({ montant: 100, montant_regle: 40, statut: 'en_retard' })).toBe('partiel')
  })

  it('garde « En retard » quand aucun acompte n’a été reçu', () => {
    expect(statutReglement({ montant: 100, montant_regle: 0, statut: 'en_retard' })).toBe('en_retard')
  })

  it('laisse une ligne annulée annulée, quels que soient les versements', () => {
    expect(statutReglement({ montant: 100, montant_regle: 100, statut: 'annule' })).toBe('annule')
  })
})

describe('resteAPayer', () => {
  it('retranche les acomptes du montant dû', () => {
    expect(resteAPayer({ montant: 250, montant_regle: 80, statut: 'attendu' })).toBe(170)
  })

  it('ne descend jamais sous zéro en cas de trop-perçu', () => {
    expect(resteAPayer({ montant: 100, montant_regle: 130, statut: 'paye' })).toBe(0)
  })

  it('arrondit au centime, sinon une suite d’acomptes empêche le passage à « Payé »', () => {
    expect(resteAPayer({ montant: 100, montant_regle: 33.33 * 3, statut: 'attendu' })).toBe(0.01)
  })
})

describe('acompteSuggere', () => {
  it('propose le solde restant, cas le plus courant', () => {
    expect(acompteSuggere({ montant: 300, montant_regle: 100, statut: 'attendu' })).toBe(200)
  })
})
