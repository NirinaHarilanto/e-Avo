import { describe, expect, it } from 'vitest'
import { estPaye, estPayable, formaterDuree, libelleExtra, totauxExtra } from '../prestationsExtra'

/* Demande client du 2026-11-17 : « l'admin pourra définir le type de prestation, la durée, le
   montant de la prestation, le statut de la prestation, date et lieu [...] Pour les prestations
   VALIDÉES, le montant validé sera rajouté automatiquement dans le timesheet. »

   Tout le fichier tourne autour de ce mot : c'est le STATUT, et lui seul, qui ouvre le paiement.
   Une prestation planifiée est convenue mais pas encore due ; une annulée ne le sera jamais. Les
   confondre afficherait comme « à payer » un montant que l'admin n'a pas arrêté. */

function extra(montant: number, statut: string, paye = false) {
  return { montant, statut, teacher_payment_id: paye ? 'paie-1' : null } as never
}

describe('estPayable', () => {
  it('ne retient que les prestations validées', () => {
    expect(estPayable({ statut: 'validee' })).toBe(true)
    expect(estPayable({ statut: 'planifiee' })).toBe(false)
    expect(estPayable({ statut: 'annulee' })).toBe(false)
  })
})

describe('estPaye', () => {
  it('tient une prestation pour payée dès qu’elle porte une rémunération', () => {
    expect(estPaye({ teacher_payment_id: 'paie-1' })).toBe(true)
    expect(estPaye({ teacher_payment_id: null })).toBe(false)
  })
})

describe('totauxExtra', () => {
  /* Trois totaux et non deux, contrairement aux bonus : une prestation peut être convenue sans
     être encore due. */
  it('sépare le planifié, le validé à payer et le déjà payé', () => {
    const totaux = totauxExtra([
      extra(20000, 'planifiee'),
      extra(30000, 'validee'),
      extra(15000, 'validee', true),
    ])

    expect(totaux).toEqual({ planifie: 20000, aPayer: 30000, paye: 15000 })
  })

  /* Une prestation annulée ne compte nulle part : ni due, ni payée, ni promise. */
  it('ignore entièrement une prestation annulée', () => {
    expect(totauxExtra([extra(50000, 'annulee')])).toEqual({ planifie: 0, aPayer: 0, paye: 0 })
  })

  it('rend trois zéros sans aucune prestation', () => {
    expect(totauxExtra([])).toEqual({ planifie: 0, aPayer: 0, paye: 0 })
  })

  /* Une prestation payée l'est forcément après validation : son montant quitte « à payer ». */
  it('ne compte jamais deux fois une prestation validée puis payée', () => {
    const totaux = totauxExtra([extra(10000, 'validee', true)])
    expect(totaux.aPayer).toBe(0)
    expect(totaux.paye).toBe(10000)
  })

  /* `numeric` revient parfois en chaîne de PostgREST. */
  it('additionne des montants rendus en chaîne', () => {
    expect(totauxExtra([extra('10000' as never as number, 'validee'), extra('5000' as never as number, 'validee')]).aPayer).toBe(15000)
  })
})

describe('libelleExtra', () => {
  it('nomme le type, la date et le lieu', () => {
    expect(libelleExtra({ type_prestation: 'Atelier', date_prestation: '2026-11-20', lieu: 'En ligne' })).toBe(
      'Atelier (20/11/2026) · En ligne',
    )
  })

  it('se passe du lieu quand il n’y en a pas', () => {
    expect(libelleExtra({ type_prestation: 'Traduction', date_prestation: '2026-11-20', lieu: null })).toBe(
      'Traduction (20/11/2026)',
    )
    // Un lieu réduit à des espaces ne doit pas produire un « · » orphelin.
    expect(libelleExtra({ type_prestation: 'Traduction', date_prestation: '2026-11-20', lieu: '   ' })).toBe(
      'Traduction (20/11/2026)',
    )
  })
})

describe('formaterDuree', () => {
  it('rend heures et minutes', () => {
    expect(formaterDuree(90)).toBe('1h 30m')
    expect(formaterDuree(120)).toBe('2h')
    expect(formaterDuree(45)).toBe('45m')
  })

  /* La durée est facultative : un forfait de relecture n'en a pas toujours une qui ait un sens. */
  it('rend null quand aucune durée n’est saisie', () => {
    expect(formaterDuree(null)).toBeNull()
  })
})
