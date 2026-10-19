import { describe, expect, it } from 'vitest'
import { calculerRemuneration, tauxPourType, type TauxProfesseur } from '../remuneration'

const taux: TauxProfesseur = { taux_horaire_individuel: 10000, taux_horaire_duo: 10000, taux_horaire_collectif: 15000 }

describe('tauxPourType', () => {
  it('retourne le taux individuel pour "individuel"', () => {
    expect(tauxPourType(taux, 'individuel')).toBe(10000)
  })
  it('retourne le taux collectif pour "collectif"', () => {
    expect(tauxPourType(taux, 'collectif')).toBe(15000)
  })
  it('retourne le taux duo pour "duo"', () => {
    expect(tauxPourType(taux, 'duo')).toBe(10000)
  })
  it('retombe sur individuel pour null (écriture antérieure au type_facturation)', () => {
    expect(tauxPourType(taux, null)).toBe(10000)
  })
  it('retombe sur individuel pour une valeur inconnue', () => {
    expect(tauxPourType(taux, 'autre-chose')).toBe(10000)
  })
})

describe('calculerRemuneration', () => {
  it('additionne des écritures de types différents avec leur propre taux', () => {
    const resultat = calculerRemuneration(
      [
        { heures: 1, type_facturation: 'individuel' },
        { heures: 2, type_facturation: 'collectif' },
        { heures: 1, type_facturation: 'duo' },
      ],
      taux,
    )
    // 1×10000 + 2×15000 + 1×10000 = 50000
    expect(resultat.montant).toBe(50000)
    expect(resultat.heures).toBe(4)
    expect(resultat.manque).toEqual([])
  })

  it('traite une écriture sans type_facturation (null) comme individuelle', () => {
    const resultat = calculerRemuneration([{ heures: 2, type_facturation: null }], taux)
    expect(resultat.montant).toBe(20000)
    expect(resultat.lignes[0].type).toBe('individuel')
  })

  it('signale les types dont le taux manque, sans les compter dans le montant', () => {
    const tauxIncomplet: TauxProfesseur = { taux_horaire_individuel: 10000, taux_horaire_duo: null, taux_horaire_collectif: null }
    const resultat = calculerRemuneration(
      [
        { heures: 1, type_facturation: 'individuel' },
        { heures: 1, type_facturation: 'collectif' },
        { heures: 1, type_facturation: 'duo' },
      ],
      tauxIncomplet,
    )
    expect(resultat.montant).toBe(10000)
    expect(resultat.manque.sort()).toEqual(['collectif', 'duo'])
  })

  it('un seul arrondi sur le total, pas un arrondi répété par ligne', () => {
    const tauxFractionnaire: TauxProfesseur = { taux_horaire_individuel: 10000.333, taux_horaire_duo: null, taux_horaire_collectif: null }
    const resultat = calculerRemuneration(
      Array.from({ length: 3 }, () => ({ heures: 1 / 3, type_facturation: 'individuel' })),
      tauxFractionnaire,
    )
    expect(resultat.montant).toBe(Math.round(10000.333 * 100) / 100)
  })

  it('conserve la ligne d’origine et calcule son montant propre', () => {
    const resultat = calculerRemuneration([{ heures: 2, type_facturation: 'collectif', sessionId: 's1' }], taux)
    expect(resultat.lignes[0].ligne).toEqual({ heures: 2, type_facturation: 'collectif', sessionId: 's1' })
    expect(resultat.lignes[0].montant).toBe(30000)
  })

  it('aucune écriture : montant et heures à zéro, pas de type manquant', () => {
    const resultat = calculerRemuneration([], taux)
    expect(resultat).toEqual({ lignes: [], montant: 0, heures: 0, manque: [] })
  })

  /* Prestations hors cursus (0131) : corporate et chat & chill ont leur propre taux, et ne
     doivent SURTOUT pas retomber sur le taux individuel — c'est justement ce qui distingue une
     prestation facturée à une entreprise d'un cours d'élève. */
  describe('prestations corporate et chat & chill', () => {
    const tauxComplet: TauxProfesseur = {
      taux_horaire_individuel: 10000,
      taux_horaire_duo: 12000,
      taux_horaire_collectif: 15000,
      taux_horaire_corporate: 40000,
      taux_horaire_chat_chill: 25000,
    }

    it('applique le taux corporate à une prestation corporate', () => {
      const resultat = calculerRemuneration([{ heures: 2, type_facturation: 'corporate' }], tauxComplet)
      expect(resultat.montant).toBe(80000)
      expect(resultat.lignes[0].type).toBe('corporate')
      expect(resultat.manque).toEqual([])
    })

    it('applique le taux chat & chill à une prestation chat & chill', () => {
      const resultat = calculerRemuneration([{ heures: 1.5, type_facturation: 'chat_chill' }], tauxComplet)
      expect(resultat.montant).toBe(37500)
    })

    it('mélange séances et prestations sur un même relevé', () => {
      const resultat = calculerRemuneration(
        [
          { heures: 1, type_facturation: 'individuel' },
          { heures: 1, type_facturation: 'corporate' },
          { heures: 1, type_facturation: 'chat_chill' },
        ],
        tauxComplet,
      )
      expect(resultat.montant).toBe(75000)
      expect(resultat.heures).toBe(3)
    })

    it('signale le taux manquant au lieu de facturer au taux individuel', () => {
      const resultat = calculerRemuneration([{ heures: 2, type_facturation: 'corporate' }], taux)
      expect(resultat.montant).toBe(0)
      expect(resultat.manque).toEqual(['corporate'])
    })

    it('un type inconnu retombe sur individuel plutôt que de produire un taux fantôme', () => {
      const resultat = calculerRemuneration([{ heures: 1, type_facturation: 'type_futur' }], tauxComplet)
      expect(resultat.lignes[0].type).toBe('individuel')
      expect(resultat.montant).toBe(10000)
    })
  })
})
