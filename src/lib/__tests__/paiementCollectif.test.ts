import { describe, expect, it } from 'vitest'
import {
  MOIS_CYCLE_COLLECTIF,
  echeancierCollectif,
  montantEncaisseALInscription,
  premiereMensualite,
  totalCycleCollectif,
} from '../paiementCollectif'

/* Demande client du 2026-10-31 : « les prix affichés sont les prix mensuels pour une période de
   deux mois, donc les étudiants collectifs, soit paient en une seule fois le montant total soit
   paient par mois ». Avant cela, le prix mensuel de la grille était encaissé tel quel — un élève
   collectif était enregistré pour la moitié de ce qu'il doit. */

describe('totalCycleCollectif', () => {
  it('multiplie le prix mensuel par la durée du cycle', () => {
    expect(totalCycleCollectif(150_000)).toBe(150_000 * MOIS_CYCLE_COLLECTIF)
  })
})

describe('echeancierCollectif', () => {
  it('rend une échéance par mois du cycle', () => {
    const echeances = echeancierCollectif(300_000, new Date(2026, 10, 15))
    expect(echeances).toHaveLength(MOIS_CYCLE_COLLECTIF)
    expect(echeances.map((e) => e.montant)).toEqual([150_000, 150_000])
  })

  it('date la première au jour du départ, les suivantes de mois en mois', () => {
    const echeances = echeancierCollectif(300_000, new Date(2026, 10, 15))
    expect(echeances[0].date_echeance).toBe('2026-11-15')
    expect(echeances[1].date_echeance).toBe('2026-12-15')
  })

  /* Le jour se lit sur les accesseurs LOCAUX : passer par `toISOString()` reculerait la date
     d'un cran en soirée à Madagascar (UTC+3), comme partout ailleurs dans HOC. */
  it('ne recule pas d’un jour quand le départ est en soirée', () => {
    const echeances = echeancierCollectif(300_000, new Date(2026, 10, 15, 23, 30))
    expect(echeances[0].date_echeance).toBe('2026-11-15')
  })

  it('fait absorber l’arrondi par la dernière mensualité', () => {
    const echeances = echeancierCollectif(300_001, new Date(2026, 10, 15))
    expect(echeances.reduce((total, e) => total + e.montant, 0)).toBe(300_001)
    expect(echeances[0].montant).toBe(premiereMensualite(300_001))
  })
})

describe('montantEncaisseALInscription', () => {
  it('encaisse la totalité en paiement intégral', () => {
    expect(montantEncaisseALInscription(300_000, 'integral', true)).toBe(300_000)
  })

  it('n’encaisse que la première mensualité en paiement mensualisé', () => {
    expect(montantEncaisseALInscription(300_000, 'mensuel', true)).toBe(150_000)
  })

  /* Un candidat peut rejoindre la vague sans avoir encore payé : la ligne existe alors comme
     montant entièrement à encaisser. */
  it('n’encaisse rien tant que rien n’est réglé', () => {
    expect(montantEncaisseALInscription(300_000, 'integral', false)).toBe(0)
    expect(montantEncaisseALInscription(300_000, 'mensuel', false)).toBe(0)
  })
})
