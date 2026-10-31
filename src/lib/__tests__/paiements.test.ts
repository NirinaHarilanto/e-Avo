import { describe, expect, it } from 'vitest'
import { acompteSuggere, resteAPayer, statutReglement, verdictEcheancier } from '../paiements'

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

  /* Incident du 2026-10-13 : les forfaits collectifs, dont `packages.montant` est toujours null
     (le prix est porté par une ligne de frais à part), arrivaient ici avec un montant ramené à 0.
     `0 >= 0` les affichait « Payé » alors qu'aucun encaissement n'avait eu lieu. */
  it('n’affiche jamais « Payé » pour un montant jamais renseigné et rien d’encaissé', () => {
    expect(statutReglement({ montant: 0, montant_regle: 0, statut: 'attendu' })).toBe('a_payer')
  })

  it('garde « En retard » sur un montant non renseigné déjà échu', () => {
    expect(statutReglement({ montant: 0, montant_regle: 0, statut: 'en_retard' })).toBe('en_retard')
  })

  it('respecte un solde explicite en base même à montant nul (geste commercial)', () => {
    expect(statutReglement({ montant: 0, montant_regle: 0, statut: 'paye' })).toBe('paye')
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

/* Rapprochement échéancier / acomptes — signalé par le client le 2026-10-31, capture à l'appui :
   une ligne soldée affichait « Planifié et non réglé : 600 000 Ar sur 0,00 Ar restant dus », deux
   chiffres calculés séparément et imprimés côte à côte sans jamais être comparés. */
describe('verdictEcheancier', () => {
  it('reconnaît une ligne soldée sans rien de planifié', () => {
    expect(verdictEcheancier(0, 0)).toEqual({ cas: 'soldee' })
  })

  it('invite à planifier quand il reste à encaisser et que rien ne l’est', () => {
    expect(verdictEcheancier(0, 600_000)).toEqual({ cas: 'a_planifier', resteDu: 600_000 })
  })

  it('dit que tout le reste dû est couvert', () => {
    expect(verdictEcheancier(600_000, 600_000)).toEqual({ cas: 'couvert', planifie: 600_000 })
  })

  it('chiffre ce qu’il reste à planifier', () => {
    expect(verdictEcheancier(400_000, 600_000)).toEqual({ cas: 'partiel', planifie: 400_000, aPlanifier: 200_000 })
  })

  /* Le cas exact de la capture : la ligne est soldée par deux acomptes, et une échéance de
     600 000 Ar reste planifiée. C'est une contradiction du dossier, pas un état normal. */
  it('dénonce un excédent planifié sur une ligne déjà soldée', () => {
    expect(verdictEcheancier(600_000, 0)).toEqual({
      cas: 'excedent',
      planifie: 600_000,
      excedent: 600_000,
      resteDu: 0,
    })
  })

  it('dénonce aussi un excédent partiel', () => {
    expect(verdictEcheancier(600_000, 500_000)).toEqual({
      cas: 'excedent',
      planifie: 600_000,
      excedent: 100_000,
      resteDu: 500_000,
    })
  })

  /* Les montants viennent de colonnes `numeric` et de saisies : sans arrondi, une somme
     d'échéances laisse des écarts du type 0.000000001 qui feraient crier à l'excédent. */
  it('ne crie pas à l’excédent pour une poussière de virgule flottante', () => {
    expect(verdictEcheancier(0.1 + 0.2, 0.3)).toEqual({ cas: 'couvert', planifie: 0.3 })
  })

  it('traite un reste dû négatif comme un solde nul', () => {
    expect(verdictEcheancier(0, -50)).toEqual({ cas: 'soldee' })
  })
})
