import { describe, expect, it } from 'vitest'
import { heuresDepuisMinutes, montantEstime, peutEtreCloturee, peutEtreModifiee } from '../prestationsExternes'

/* Les deux règles qui décident de ce qu'on peut faire d'une prestation corporate ou chat & chill
   (0131). Elles comptent : la clôture crédite des heures qui partent ensuite en facturation sur
   le TimeSheet du professeur. */
describe('peutEtreCloturee', () => {
  const maintenant = new Date('2026-10-19T14:00:00.000Z')

  it('refuse une prestation qui n’a pas encore commencé', () => {
    // Créditer des heures jamais données les enverrait en facturation.
    expect(peutEtreCloturee({ statut: 'planifiee', debut: '2026-10-19T15:00:00.000Z' }, maintenant)).toBe(false)
  })

  it('accepte dès l’heure de début atteinte', () => {
    expect(peutEtreCloturee({ statut: 'planifiee', debut: '2026-10-19T14:00:00.000Z' }, maintenant)).toBe(true)
    expect(peutEtreCloturee({ statut: 'planifiee', debut: '2026-10-19T13:00:00.000Z' }, maintenant)).toBe(true)
  })

  it('refuse une prestation déjà terminée ou annulée', () => {
    expect(peutEtreCloturee({ statut: 'terminee', debut: '2026-10-18T10:00:00.000Z' }, maintenant)).toBe(false)
    expect(peutEtreCloturee({ statut: 'annulee', debut: '2026-10-18T10:00:00.000Z' }, maintenant)).toBe(false)
  })

  it('refuse plutôt que de se tromper sur une date illisible', () => {
    expect(peutEtreCloturee({ statut: 'planifiee', debut: 'pas-une-date' }, maintenant)).toBe(false)
  })
})

describe('peutEtreModifiee', () => {
  it('n’autorise la modification que tant que la prestation est planifiée', () => {
    // Une prestation terminée a déjà écrit son crédit d'heures : en changer la durée après coup
    // désaccorderait le registre et le relevé.
    expect(peutEtreModifiee({ statut: 'planifiee' })).toBe(true)
    expect(peutEtreModifiee({ statut: 'terminee' })).toBe(false)
    expect(peutEtreModifiee({ statut: 'annulee' })).toBe(false)
  })
})

describe('heuresDepuisMinutes', () => {
  it('convertit en heures décimales, arrondies au centième', () => {
    expect(heuresDepuisMinutes(60)).toBe(1)
    expect(heuresDepuisMinutes(90)).toBe(1.5)
    expect(heuresDepuisMinutes(45)).toBe(0.75)
    expect(heuresDepuisMinutes(50)).toBe(0.83)
  })
})

describe('montantEstime', () => {
  it('multiplie la durée réelle par le taux', () => {
    expect(montantEstime(90, 20000)).toBe(30000)
    expect(montantEstime(45, 20000)).toBe(15000)
  })

  it('ne rend aucun montant sans taux renseigné', () => {
    // « 0 Ar » serait un montant faux, pas une absence de montant.
    expect(montantEstime(60, null)).toBeNull()
    expect(montantEstime(60, undefined)).toBeNull()
  })
})
