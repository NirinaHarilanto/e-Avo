import { describe, expect, it } from 'vitest'
import {
  categorieDepuisNiveauEstime,
  fraisInscriptionCollectif,
  LABEL_NIVEAU_CLASSE,
  niveauNormalise,
  niveauRetenu,
  NIVEAUX_ANGLAIS,
  parcoursCollectifTermine,
  periodeClasse,
  rangNiveau,
  seancesRestantesClasse,
} from '../classesCollectif'

describe('categorieDepuisNiveauEstime', () => {
  /* Depuis l'uniformisation du 2026-10-31, niveau et classe portent le même mot : la fonction
     n'est plus qu'un changement de casse pour un niveau à l'échelle. Elle continue néanmoins de
     traduire les anciennes valeurs CECRL, que des dossiers portent encore. */
  it('classe un niveau de l’échelle sur la classe du même nom', () => {
    expect(categorieDepuisNiveauEstime('Beginner')).toBe('beginner')
    expect(categorieDepuisNiveauEstime('Intermediate')).toBe('intermediate')
    expect(categorieDepuisNiveauEstime('Advanced')).toBe('advanced')
  })

  it('classe A1 et A2 en beginner', () => {
    expect(categorieDepuisNiveauEstime('A1')).toBe('beginner')
    expect(categorieDepuisNiveauEstime('A2')).toBe('beginner')
  })

  /* Les dossiers écrits avant la migration 0122 portent encore l'ancien libellé : ils doivent
     continuer de retrouver leur classe, sans quoi un ancien élève se retrouverait sans
     affectation à la relecture de son parcours. */
  it('reconnaît encore l’ancien libellé « A1 (débutant) »', () => {
    expect(categorieDepuisNiveauEstime('A1 (débutant)')).toBe('beginner')
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
    for (const niveau of NIVEAUX_ANGLAIS) {
      expect(categorieDepuisNiveauEstime(niveau)).not.toBeNull()
    }
  })
})

describe('niveauRetenu', () => {
  it('fait primer le niveau du test oral sur celui du quiz écrit', () => {
    expect(niveauRetenu('Intermediate', 'Beginner')).toBe('Intermediate')
  })

  it('retombe sur le quiz écrit tant que l’oral n’a rien arrêté', () => {
    expect(niveauRetenu(null, 'Intermediate')).toBe('Intermediate')
    expect(niveauRetenu('', 'Intermediate')).toBe('Intermediate')
    expect(niveauRetenu('   ', 'Intermediate')).toBe('Intermediate')
    expect(niveauRetenu(undefined, 'Intermediate')).toBe('Intermediate')
  })

  it('rend null quand aucun des deux n’est connu', () => {
    expect(niveauRetenu(null, null)).toBeNull()
    expect(niveauRetenu(undefined, undefined)).toBeNull()
  })
})

describe('rangNiveau', () => {
  it('ordonne les niveaux du plus faible au plus avancé', () => {
    expect(NIVEAUX_ANGLAIS.map(rangNiveau)).toEqual([0, 1, 2])
    expect(rangNiveau('Beginner')).toBeLessThan(rangNiveau('Intermediate')!)
    expect(rangNiveau('Intermediate')).toBeLessThan(rangNiveau('Advanced')!)
  })

  /* Un dossier écrit avant l'uniformisation du 2026-10-31 porte encore un niveau CECRL : il doit
     se ranger au bon endroit de l'échelle, pas à la fin du tableau. */
  it('range un ancien niveau CECRL à sa place', () => {
    expect(rangNiveau('A2')).toBe(rangNiveau('Beginner'))
    expect(rangNiveau('B2')).toBe(rangNiveau('Intermediate'))
    expect(rangNiveau('C1')).toBe(rangNiveau('Advanced'))
  })

  it('rend null pour une valeur absente ou non reconnue, plutôt qu’un rang arbitraire', () => {
    expect(rangNiveau(null)).toBeNull()
    expect(rangNiveau('Intermédiaire')).toBeNull()
  })
})

/* Demande client du 2026-10-31 : « il faudrait uniformiser les niveaux dans toute l'application
   HOC : Beginner, Intermediate, Advanced ». Deux échelles désignaient jusque-là la même chose —
   le CECRL pour le quiz et le niveau évalué, l'échelle anglaise pour les classes — et le même
   champ affichait « A1 » sur un dossier, « Intermediate » sur un autre. */
describe('NIVEAUX_ANGLAIS', () => {
  it('ne propose que les trois niveaux de l’échelle HOC', () => {
    expect(NIVEAUX_ANGLAIS).toEqual(['Beginner', 'Intermediate', 'Advanced'])
  })

  it('porte exactement les libellés des classes de niveau', () => {
    expect([...NIVEAUX_ANGLAIS]).toEqual(Object.values(LABEL_NIVEAU_CLASSE))
  })
})

describe('niveauNormalise', () => {
  it('traduit les anciens niveaux CECRL dans l’échelle en vigueur', () => {
    expect(niveauNormalise('A1')).toBe('Beginner')
    expect(niveauNormalise('A1 (débutant)')).toBe('Beginner')
    expect(niveauNormalise('A2')).toBe('Beginner')
    expect(niveauNormalise('B1')).toBe('Intermediate')
    expect(niveauNormalise('B2')).toBe('Intermediate')
    expect(niveauNormalise('C1')).toBe('Advanced')
    expect(niveauNormalise('C2')).toBe('Advanced')
  })

  /* Niveau de classe introduit par 0139, fusionné dans « Advanced » par 0141 — des dossiers le
     portent encore, dont un relevé en base le 2026-10-31. */
  it('ramène « Pre advanced » à Advanced', () => {
    expect(niveauNormalise('Pre advanced')).toBe('Advanced')
  })

  it('laisse passer un niveau déjà à l’échelle, quelle que soit la casse', () => {
    expect(niveauNormalise('Intermediate')).toBe('Intermediate')
    expect(niveauNormalise('intermediate')).toBe('Intermediate')
  })

  it('rend null plutôt que de deviner, pour une valeur inconnue', () => {
    expect(niveauNormalise('Intermédiaire')).toBeNull()
    expect(niveauNormalise(null)).toBeNull()
    expect(niveauNormalise('  ')).toBeNull()
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
    expect(fraisInscriptionCollectif(grille, 'A1')).toBe(150000)
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

describe('periodeClasse', () => {
  it('affiche les deux dates quand les deux sont connues', () => {
    expect(periodeClasse({ date_debut: '2026-09-14', date_fin: '2026-11-14' })).toBe('14/09/2026 → 14/11/2026')
  })

  it("se limite à « à partir du » quand seul le début est connu", () => {
    expect(periodeClasse({ date_debut: '2026-09-14', date_fin: null })).toBe('à partir du 14/09/2026')
  })

  it("se limite à « jusqu'au » quand seule la fin est connue", () => {
    expect(periodeClasse({ date_debut: null, date_fin: '2026-11-14' })).toBe("jusqu'au 14/11/2026")
  })

  it('rend null plutôt qu’une phrase vide quand rien n’est renseigné', () => {
    expect(periodeClasse({ date_debut: null, date_fin: null })).toBeNull()
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

describe('seancesRestantesClasse', () => {
  it('décompte les séances planifiées et terminées, jamais les annulées ni les reportées', () => {
    const seances = [
      { statut: 'planifiee' },
      { statut: 'planifiee' },
      { statut: 'terminee' },
      { statut: 'annulee' },
      { statut: 'reportee' },
    ]
    // 32 - 3 (planifiee + planifiee + terminee), les 2 autres ne comptent pas.
    expect(seancesRestantesClasse(seances, 32)).toBe(29)
  })

  it('ne descend jamais sous zéro quand le forfait est dépassé', () => {
    const seances = Array.from({ length: 5 }, () => ({ statut: 'terminee' }))
    expect(seancesRestantesClasse(seances, 3)).toBe(0)
  })

  it('renvoie le forfait entier sans aucune séance', () => {
    expect(seancesRestantesClasse([], 32)).toBe(32)
  })
})
