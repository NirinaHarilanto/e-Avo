import { describe, expect, it } from 'vitest'
import {
  categorieDepuisNiveauEstime,
  fraisInscriptionCollectif,
  libelleNiveauCecrl,
  niveauRetenu,
  NIVEAUX_CECRL,
  parcoursCollectifTermine,
  rangNiveauCecrl,
} from '../classesCollectif'

describe('categorieDepuisNiveauEstime', () => {
  it('classe A1 et A2 en beginner', () => {
    expect(categorieDepuisNiveauEstime('A1 (débutant)')).toBe('beginner')
    expect(categorieDepuisNiveauEstime('A2')).toBe('beginner')
  })

  it('classe B1 et B2 en intermediate', () => {
    expect(categorieDepuisNiveauEstime('B1')).toBe('intermediate')
    expect(categorieDepuisNiveauEstime('B2')).toBe('intermediate')
  })

  it('classe C1 en advanced', () => {
    expect(categorieDepuisNiveauEstime('C1')).toBe('advanced')
  })

  it("renvoie null pour un niveau non évalué ou inconnu", () => {
    expect(categorieDepuisNiveauEstime('Non évalué')).toBeNull()
    expect(categorieDepuisNiveauEstime(null)).toBeNull()
    expect(categorieDepuisNiveauEstime('valeur-inattendue')).toBeNull()
  })

  /* La liste déroulante du test oral (demande client du 2026-10-11) ne doit jamais proposer un
     niveau que le barème ci-dessus ne saurait pas traduire en classe : c'était tout l'intérêt de
     remplacer la saisie libre. */
  it('ne propose que des niveaux qui donnent une classe', () => {
    for (const niveau of NIVEAUX_CECRL) {
      expect(categorieDepuisNiveauEstime(niveau)).not.toBeNull()
    }
  })
})

describe('niveauRetenu', () => {
  it('fait primer le niveau du test oral sur celui du quiz écrit', () => {
    expect(niveauRetenu('A2', 'A1 (débutant)')).toBe('A2')
  })

  it('retombe sur le quiz écrit tant que l’oral n’a rien arrêté', () => {
    expect(niveauRetenu(null, 'B1')).toBe('B1')
    expect(niveauRetenu('', 'B1')).toBe('B1')
    expect(niveauRetenu('   ', 'B1')).toBe('B1')
    expect(niveauRetenu(undefined, 'B1')).toBe('B1')
  })

  it('rend null quand aucun des deux n’est connu', () => {
    expect(niveauRetenu(null, null)).toBeNull()
    expect(niveauRetenu(undefined, undefined)).toBeNull()
  })
})

describe('rangNiveauCecrl', () => {
  it('ordonne les niveaux du plus faible au plus avancé', () => {
    const rangs = NIVEAUX_CECRL.map(rangNiveauCecrl)
    expect(rangs).toEqual([0, 1, 2, 3, 4])
    expect(rangNiveauCecrl('B1')).toBeLessThan(rangNiveauCecrl('B2')!)
    expect(rangNiveauCecrl('A2')).toBeLessThan(rangNiveauCecrl('B1')!)
  })

  it('rend null pour une valeur absente ou non reconnue, plutôt qu’un rang arbitraire', () => {
    expect(rangNiveauCecrl(null)).toBeNull()
    expect(rangNiveauCecrl('Intermédiaire')).toBeNull()
  })
})

describe('libelleNiveauCecrl', () => {
  // Capture client du 2026-10-11 : « A1 (débutant) · classe Beginner » répétait deux fois la
  // même idée dans la liste déroulante — raccourci à l'affichage seulement.
  it('raccourcit A1 (débutant) en A1', () => {
    expect(libelleNiveauCecrl('A1 (débutant)')).toBe('A1')
  })

  it('laisse les autres niveaux inchangés', () => {
    expect(libelleNiveauCecrl('A2')).toBe('A2')
    expect(libelleNiveauCecrl('B1')).toBe('B1')
    expect(libelleNiveauCecrl('B2')).toBe('B2')
    expect(libelleNiveauCecrl('C1')).toBe('C1')
  })
})

describe('fraisInscriptionCollectif', () => {
  // La grille réelle au 2026-10-11 : trois niveaux au même prix, mais rien n'oblige à ce qu'ils
  // le restent — d'où des prix distincts ici, pour vérifier que c'est bien CELUI du niveau.
  const grille = [
    { type_programme: 'collectif', titre: 'Beginner', prix: '150000.00' },
    { type_programme: 'collectif', titre: 'Intermediate', prix: '180000.00' },
    { type_programme: 'collectif', titre: 'Advanced', prix: '210000.00' },
    { type_programme: 'individuel', titre: '10h', prix: '300000.00' },
  ]

  it('prend le prix du niveau du candidat', () => {
    expect(fraisInscriptionCollectif(grille, 'A1 (débutant)')).toBe(150000)
    expect(fraisInscriptionCollectif(grille, 'A2')).toBe(150000)
    expect(fraisInscriptionCollectif(grille, 'B1')).toBe(180000)
    expect(fraisInscriptionCollectif(grille, 'C1')).toBe(210000)
  })

  it('ignore les tarifs des autres programmes', () => {
    expect(fraisInscriptionCollectif([{ type_programme: 'individuel', titre: 'Beginner', prix: 9 }], 'A2')).toBeNull()
  })

  it('reconnaît le titre quelle que soit sa casse ou ses espaces', () => {
    expect(fraisInscriptionCollectif([{ type_programme: 'collectif', titre: '  BEGINNER ', prix: 150000 }], 'A2')).toBe(150000)
  })

  it('rend null plutôt qu’un montant trompeur quand rien ne correspond', () => {
    expect(fraisInscriptionCollectif(grille, null)).toBeNull()
    expect(fraisInscriptionCollectif(grille, 'Intermédiaire')).toBeNull()
    expect(fraisInscriptionCollectif([], 'A2')).toBeNull()
    // Un tarif laissé à 0 dans la grille ne décrit pas des frais exploitables.
    expect(fraisInscriptionCollectif([{ type_programme: 'collectif', titre: 'Beginner', prix: 0 }], 'A2')).toBeNull()
  })
})

describe('parcoursCollectifTermine', () => {
  it('est terminé dès que les heures consommées atteignent le forfait', () => {
    expect(parcoursCollectifTermine(32, 32)).toBe(true)
    expect(parcoursCollectifTermine(35, 32)).toBe(true)
  })

  it('n’est pas terminé tant qu’il reste des heures', () => {
    expect(parcoursCollectifTermine(31.5, 32)).toBe(false)
    expect(parcoursCollectifTermine(0, 32)).toBe(false)
  })

  it('n’est jamais terminé sans forfait connu, plutôt qu’une réévaluation prématurée', () => {
    expect(parcoursCollectifTermine(100, null)).toBe(false)
    expect(parcoursCollectifTermine(100, 0)).toBe(false)
  })
})
