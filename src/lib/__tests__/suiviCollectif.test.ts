import { describe, expect, it } from 'vitest'
import { classePrevue, construireSuiviCollectif, libelleClasse, rangEtapeCollectif, rangFrais } from '../suiviCollectif'

/* Suivi du parcours collectif (demande client du 2026-10-11). Ce qui compte ici : qu'une
   personne apparaisse avec les bonnes informations à CHAQUE étape de son parcours — simple
   candidat, candidat passé à l'oral, étudiant affecté — alors que ces informations vivent dans
   des tables différentes selon l'étape. */

const BASE = {
  prospects: [],
  inscriptions: [],
  creneaux: [],
  profils: [],
  inscriptionsVagues: [],
  classes: [],
  paiements: [],
}

function prospect(id: string, statut: 'prospect' | 'diagnostic_planifie' | 'diagnostic_fait' | 'etudiant' = 'prospect') {
  return { id, prenom: 'Berndar', nom: 'Bensas', email: 'b@x.test', statut, type_programme: 'collectif' as const }
}

describe('construireSuiviCollectif', () => {
  it('ne retient que les candidats du programme collectif', () => {
    const lignes = construireSuiviCollectif({
      ...BASE,
      prospects: [
        prospect('collectif-1'),
        { id: 'individuel-1', prenom: 'A', nom: 'B', email: null, statut: 'prospect', type_programme: 'individuel' },
        { id: 'sans-programme', prenom: 'C', nom: 'D', email: null, statut: 'prospect', type_programme: null },
      ],
    })
    expect(lignes.map((l) => l.prospectId)).toEqual(['collectif-1'])
  })

  it('montre un candidat sans inscription au test, sans rien inventer', () => {
    const [ligne] = construireSuiviCollectif({ ...BASE, prospects: [prospect('p1')] })
    expect(ligne).toMatchObject({
      nom: 'Berndar Bensas',
      etape: 'prospect',
      sessionOrale: null,
      vagueId: null,
      classe: null,
      niveauTest: null,
      niveauFinal: null,
      frais: 'aucun',
    })
  })

  it('rattache la session orale et la vague visée dès l’inscription au test', () => {
    const [ligne] = construireSuiviCollectif({
      ...BASE,
      prospects: [prospect('p1', 'diagnostic_planifie')],
      inscriptions: [
        { prospect_id: 'p1', creneau_id: 'c1', niveau_estime: 'A1 (débutant)', niveau_final: null, score: 2, total: 10, created_at: '2026-10-01' },
      ],
      creneaux: [{ id: 'c1', debut: '2026-10-17T05:00:00Z', cohort_id: 'vague-nov' }],
    })
    expect(ligne).toMatchObject({
      sessionOrale: '2026-10-17T05:00:00Z',
      vagueId: 'vague-nov',
      niveauTest: 'A1 (débutant)',
      niveauFinal: null,
      classe: null,
    })
  })

  it('garde la DERNIÈRE inscription quand le candidat a reporté son oral', () => {
    const [ligne] = construireSuiviCollectif({
      ...BASE,
      prospects: [prospect('p1')],
      inscriptions: [
        { prospect_id: 'p1', creneau_id: 'ancien', niveau_estime: 'A1 (débutant)', niveau_final: null, score: 2, total: 10, created_at: '2026-09-01' },
        { prospect_id: 'p1', creneau_id: 'recent', niveau_estime: 'B1', niveau_final: null, score: 6, total: 10, created_at: '2026-10-01' },
      ],
      creneaux: [
        { id: 'ancien', debut: '2026-09-10T05:00:00Z', cohort_id: 'vague-sept' },
        { id: 'recent', debut: '2026-10-17T05:00:00Z', cohort_id: 'vague-nov' },
      ],
    })
    expect(ligne.sessionOrale).toBe('2026-10-17T05:00:00Z')
    expect(ligne.vagueId).toBe('vague-nov')
    expect(ligne.niveauTest).toBe('B1')
  })

  it('suit un étudiant converti jusqu’à sa classe, et montre les deux niveaux', () => {
    const [ligne] = construireSuiviCollectif({
      ...BASE,
      prospects: [prospect('p1', 'etudiant')],
      inscriptions: [
        { prospect_id: 'p1', creneau_id: 'c1', niveau_estime: 'A1 (débutant)', niveau_final: 'A2', score: 2, total: 10, created_at: '2026-10-01' },
      ],
      creneaux: [{ id: 'c1', debut: '2026-10-17T05:00:00Z', cohort_id: 'vague-nov' }],
      profils: [{ id: 'profil-1', prospect_id: 'p1' }],
      inscriptionsVagues: [{ student_id: 'profil-1', cohort_id: 'vague-nov', cohort_class_id: 'classe-1' }],
      classes: [{ id: 'classe-1', nom: 'CLASSE 1', niveau: 'beginner' }],
    })
    expect(ligne).toMatchObject({
      profilId: 'profil-1',
      etape: 'etudiant',
      classe: 'Beginner — CLASSE 1',
      niveauTest: 'A1 (débutant)',
      niveauFinal: 'A2',
    })
  })

  it('reste sans classe pour un étudiant inscrit à la vague mais pas encore affecté', () => {
    const [ligne] = construireSuiviCollectif({
      ...BASE,
      prospects: [prospect('p1', 'etudiant')],
      profils: [{ id: 'profil-1', prospect_id: 'p1' }],
      inscriptionsVagues: [{ student_id: 'profil-1', cohort_id: 'vague-nov', cohort_class_id: null }],
    })
    expect(ligne.vagueId).toBe('vague-nov')
    expect(ligne.classe).toBeNull()
  })

  describe('frais d’inscription', () => {
    const converti = {
      ...BASE,
      prospects: [prospect('p1', 'etudiant')],
      profils: [{ id: 'profil-1', prospect_id: 'p1' }],
    }

    it('distingue réglé, attendu et rien du tout', () => {
      expect(construireSuiviCollectif(converti)[0]).toMatchObject({ frais: 'aucun', montantFrais: 0 })
      expect(
        construireSuiviCollectif({ ...converti, paiements: [{ prospect_id: 'p1', student_id: null, montant: 150000, montant_regle: 0 }] })[0],
      ).toMatchObject({ frais: 'attendu', montantFrais: 150000 })
      expect(
        construireSuiviCollectif({ ...converti, paiements: [{ prospect_id: null, student_id: 'profil-1', montant: 150000, montant_regle: 150000 }] })[0],
      ).toMatchObject({ frais: 'regle', montantFrais: 150000 })
    })

    it('ne compte pas deux fois une ligne portant les deux clés', () => {
      // convert-prospect.ts pose `prospect_id` ET `student_id` sur la même ligne.
      const [ligne] = construireSuiviCollectif({
        ...converti,
        paiements: [{ prospect_id: 'p1', student_id: 'profil-1', montant: 150000, montant_regle: 150000 }],
      })
      expect(ligne.montantFrais).toBe(150000)
      expect(ligne.frais).toBe('regle')
    })

    it('reste « attendu » tant qu’un acompte ne couvre pas tout', () => {
      const [ligne] = construireSuiviCollectif({
        ...converti,
        paiements: [{ prospect_id: 'p1', student_id: null, montant: 150000, montant_regle: 50000 }],
      })
      expect(ligne.frais).toBe('attendu')
    })

    it('ignore les paiements d’une autre personne', () => {
      const [ligne] = construireSuiviCollectif({
        ...converti,
        paiements: [{ prospect_id: 'quelquun-dautre', student_id: null, montant: 999, montant_regle: 999 }],
      })
      expect(ligne.frais).toBe('aucun')
      expect(ligne.montantFrais).toBe(0)
    })
  })
})

describe('rangEtapeCollectif', () => {
  it('ordonne les étapes dans le sens du parcours, pas alphabétiquement', () => {
    expect(rangEtapeCollectif('prospect')).toBeLessThan(rangEtapeCollectif('diagnostic_planifie'))
    expect(rangEtapeCollectif('diagnostic_planifie')).toBeLessThan(rangEtapeCollectif('diagnostic_fait'))
    expect(rangEtapeCollectif('diagnostic_fait')).toBeLessThan(rangEtapeCollectif('etudiant'))
  })
})

describe('rangFrais', () => {
  it('ordonne du moins réglé au plus réglé, pour faire remonter ce qui manque', () => {
    expect(rangFrais('aucun')).toBeLessThan(rangFrais('attendu'))
    expect(rangFrais('attendu')).toBeLessThan(rangFrais('regle'))
  })
})

describe('libelleClasse', () => {
  it('préfixe le nom de la classe par son niveau', () => {
    expect(libelleClasse({ id: 'c', nom: 'CLASSE 1', niveau: 'intermediate' })).toBe('Intermediate — CLASSE 1')
  })

  it('se contente du niveau quand la classe n’a pas de nom', () => {
    expect(libelleClasse({ id: 'c', nom: null, niveau: 'advanced' })).toBe('Advanced')
    expect(libelleClasse(undefined)).toBeNull()
  })
})

describe('classePrevue', () => {
  const ligne = { niveauTest: 'A1 (débutant)', niveauFinal: null } as Parameters<typeof classePrevue>[0]

  it('annonce la classe d’atterrissage d’après le niveau retenu', () => {
    expect(classePrevue(ligne)).toBe('Beginner')
    expect(classePrevue({ ...ligne, niveauFinal: 'B2' })).toBe('Intermediate')
  })

  it('ne promet rien quand aucun niveau n’est connu', () => {
    expect(classePrevue({ ...ligne, niveauTest: null })).toBeNull()
  })
})
