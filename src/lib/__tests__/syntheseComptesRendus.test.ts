import { describe, expect, it } from 'vitest'
import { construireSynthese, syntheseEnTexte, type EntreeCompteRendu } from '../syntheseComptesRendus'
import type { CompteRenduValeurs } from '../compteRendu'

function rapport(valeurs: Partial<CompteRenduValeurs> = {}): CompteRenduValeurs {
  return {
    objectifs: [],
    lecons_abordees: null,
    contenu_cours: null,
    nouveau_vocabulaire: null,
    erreurs_importantes: null,
    points_forts: null,
    points_a_ameliorer: null,
    devoirs: null,
    progres: null,
    priorites_prochain_cours: null,
    conseils_prochain_professeur: null,
    remarques: null,
    ...valeurs,
  }
}

function entree(debut: string, valeurs: Partial<CompteRenduValeurs>, extra: Partial<EntreeCompteRendu> = {}): EntreeCompteRendu {
  return {
    rapport: rapport(valeurs),
    debut,
    dureeMinutes: 60,
    type: 'individuel',
    professeur: 'Alice Martin',
    present: true,
    ...extra,
  }
}

describe('construireSynthese', () => {
  it('ignore les comptes rendus vides', () => {
    const synthese = construireSynthese(
      [entree('2026-03-01T09:00:00Z', { contenu_cours: 'Present perfect' }), entree('2026-03-08T09:00:00Z', {})],
      2,
    )
    expect(synthese.nbComptesRendus).toBe(1)
    // L'écart avec les séances clôturées reste visible : c'est l'information utile à l'admin.
    expect(synthese.nbSeancesTerminees).toBe(2)
  })

  it('situe la période sur les dates de séance, même si les comptes rendus arrivent en désordre', () => {
    const synthese = construireSynthese(
      [
        entree('2026-05-20T09:00:00Z', { contenu_cours: 'Conditionnel' }),
        entree('2026-03-01T09:00:00Z', { contenu_cours: 'Present perfect' }),
      ],
      2,
    )
    expect(synthese.periode).toEqual({ premiere: '2026-03-01T09:00:00Z', derniere: '2026-05-20T09:00:00Z' })
    // Le fil se lit du plus récent au plus ancien.
    expect(synthese.entrees.map((e) => e.debut)).toEqual(['2026-05-20T09:00:00Z', '2026-03-01T09:00:00Z'])
  })

  it('cumule les heures et les compétences travaillées', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { objectifs: ['speaking', 'grammar'] }, { dureeMinutes: 90 }),
        entree('2026-03-08T09:00:00Z', { objectifs: ['speaking'] }, { dureeMinutes: 30 }),
      ],
      2,
    )
    expect(synthese.heures).toBe(2)
    expect(synthese.competences).toEqual([
      { libelle: 'Speaking', nb: 2, part: 100 },
      { libelle: 'Grammar', nb: 1, part: 50 },
    ])
  })

  it('retient la dernière note de progrès par date de séance et dégage une tendance à la hausse', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { progres: 'faible' }),
        entree('2026-03-08T09:00:00Z', { progres: 'modere' }),
        entree('2026-03-15T09:00:00Z', { progres: 'bon' }),
        entree('2026-03-22T09:00:00Z', { progres: 'important' }),
      ],
      4,
    )
    expect(synthese.dernierProgres).toEqual({ libelle: 'Important', date: '2026-03-22T09:00:00Z' })
    expect(synthese.tendance).toBe('hausse')
  })

  it('ne dégage aucune tendance en dessous de quatre notes de progrès', () => {
    const synthese = construireSynthese(
      [entree('2026-03-01T09:00:00Z', { progres: 'faible' }), entree('2026-03-08T09:00:00Z', { progres: 'important' })],
      2,
    )
    expect(synthese.tendance).toBeNull()
  })

  it('reste stable quand les notes oscillent sans progresser', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { progres: 'bon' }),
        entree('2026-03-08T09:00:00Z', { progres: 'modere' }),
        entree('2026-03-15T09:00:00Z', { progres: 'bon' }),
        entree('2026-03-22T09:00:00Z', { progres: 'modere' }),
      ],
      4,
    )
    expect(synthese.tendance).toBe('stable')
  })

  it('ne retient comme thème qu’un mot présent dans au moins deux comptes rendus, mots vides exclus', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { contenu_cours: 'Beaucoup de prononciation pendant la séance' }),
        entree('2026-03-08T09:00:00Z', { contenu_cours: 'Travail sur la prononciation des voyelles' }),
        entree('2026-03-15T09:00:00Z', { contenu_cours: 'Lecture à voix haute' }),
      ],
      3,
    )
    const mots = synthese.themes.map((t) => t.mot)
    expect(mots).toContain('prononciation')
    expect(mots).not.toContain('beaucoup')
    expect(mots).not.toContain('séance')
    expect(mots).not.toContain('travail')
    expect(mots).not.toContain('lecture')
  })

  it('compte un thème une seule fois par compte rendu, même répété', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { contenu_cours: 'Prononciation, prononciation, prononciation.' }),
        entree('2026-03-08T09:00:00Z', { contenu_cours: 'Prononciation des voyelles.' }),
      ],
      2,
    )
    expect(synthese.themes.find((t) => t.mot === 'prononciation')?.nb).toBe(2)
  })

  it('rapproche les formes accentuées et capitalisées d’un même mot', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { points_a_ameliorer: 'Régularité à revoir' }),
        entree('2026-03-08T09:00:00Z', { points_a_ameliorer: 'regularite toujours fragile' }),
      ],
      2,
    )
    expect(synthese.themes.filter((t) => t.mot.toLowerCase().startsWith('r')).map((t) => t.nb)).toContain(2)
  })

  it('liste les extraits datés du plus récent au plus ancien, sans les champs vides', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { points_a_ameliorer: 'Accent' }),
        entree('2026-03-08T09:00:00Z', { contenu_cours: 'Vocabulaire' }),
        entree('2026-03-15T09:00:00Z', { points_a_ameliorer: '   ' }),
      ],
      3,
    )
    expect(synthese.pointsAAmeliorer).toEqual([{ date: '2026-03-01T09:00:00Z', texte: 'Accent', professeur: 'Alice Martin' }])
    expect(synthese.aEteVu).toHaveLength(1)
  })

  it('compte la présence sans se laisser troubler par les séances non renseignées', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { contenu_cours: 'A' }, { present: true }),
        entree('2026-03-08T09:00:00Z', { contenu_cours: 'B' }, { present: false }),
        entree('2026-03-15T09:00:00Z', { contenu_cours: 'C' }, { present: null }),
      ],
      3,
    )
    expect(synthese.presence).toEqual({ presents: 1, absents: 1, renseignees: 2 })
  })

  it('dédoublonne les professeurs intervenus', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { contenu_cours: 'A' }, { professeur: 'Alice Martin' }),
        entree('2026-03-08T09:00:00Z', { contenu_cours: 'B' }, { professeur: 'Bob Rakoto' }),
        entree('2026-03-15T09:00:00Z', { contenu_cours: 'C' }, { professeur: 'Alice Martin' }),
      ],
      3,
    )
    expect(synthese.professeurs).toEqual(['Alice Martin', 'Bob Rakoto'])
  })

  it('rend une synthèse vide exploitable quand aucun compte rendu n’existe', () => {
    const synthese = construireSynthese([], 0)
    expect(synthese.nbComptesRendus).toBe(0)
    expect(synthese.periode).toBeNull()
    expect(synthese.dernierProgres).toBeNull()
    expect(synthese.competences).toEqual([])
    expect(synthese.themes).toEqual([])
  })
})

describe('syntheseEnTexte', () => {
  it('annonce clairement l’absence de compte rendu', () => {
    const texte = syntheseEnTexte(construireSynthese([], 0), 'Rina Be', 'Portée de test')
    expect(texte).toContain('Rina Be')
    expect(texte).toContain('Aucun compte rendu')
  })

  it('reprend les chiffres clés, les séances sans compte rendu et les extraits', () => {
    const synthese = construireSynthese(
      [
        entree('2026-03-01T09:00:00Z', { objectifs: ['speaking'], progres: 'bon', contenu_cours: 'Present perfect', points_a_ameliorer: 'Accent' }),
        entree('2026-03-08T09:00:00Z', { objectifs: ['speaking'], progres: 'important', remarques: 'Très motivée' }),
      ],
      4,
    )
    const texte = syntheseEnTexte(synthese, 'Rina Be', 'Tous les comptes rendus.')
    expect(texte).toContain('2 comptes rendus')
    expect(texte).toContain('Speaking')
    expect(texte).toContain('2 séances clôturées sans compte rendu rempli.')
    expect(texte).toContain('Accent')
    expect(texte).toContain('Present perfect')
    expect(texte).toContain('Très motivée')
    expect(texte).toContain('Important')
  })
})
