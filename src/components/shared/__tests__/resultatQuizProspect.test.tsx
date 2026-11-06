import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BlocResultatQuiz } from '../ResultatQuizProspect'

/* Demande client du 2026-11-06, capture à l'appui : « sur le pop-up diagnostic réalisé, affiche
   visuellement son résultat du quiz à l'écrit, ce serait toujours utile ». Le bloc restait
   entièrement caché une fois l'appel diagnostic réalisé, au prétexte que `niveau_evalue` est
   réécrit par l'évaluation de l'admin à ce moment-là — vrai, mais `notes` (le score et le bilan
   détaillé), lui, n'est jamais réécrit après l'insertion initiale : il reste exact pour toujours.
   Ce fichier garde la distinction : `afficherNiveau` masque la seule ligne devenue trompeuse, pas
   le reste. */

const notesAvecBilan =
  'Test de positionnement écrit : 16/50 — niveau estimé Beginner.\n\nPoints à revoir (34) :\n- Q2 : « has », attendu « have »'

describe('BlocResultatQuiz', () => {
  it('affiche le score, le niveau et le bilan quand le niveau est encore celui du quiz', () => {
    render(<BlocResultatQuiz diagnostic={{ niveau_evalue: 'Beginner', notes: notesAvecBilan }} />)

    expect(screen.getByText('16/50')).toBeTruthy()
    expect(screen.getByText('Beginner')).toBeTruthy()
    expect(screen.getByText('Voir le détail des réponses')).toBeTruthy()
  })

  /* Le cœur de la demande : une fois l'appel réalisé, `afficherNiveau={false}` masque la ligne
     devenue trompeuse SANS faire disparaître le score ni le bilan, toujours exacts. */
  it('garde le score et le bilan visibles quand le niveau affiché n’est plus celui du quiz', () => {
    render(<BlocResultatQuiz diagnostic={{ niveau_evalue: 'Advanced', notes: notesAvecBilan }} afficherNiveau={false} />)

    // Le score du quiz (16/50) reste lisible...
    expect(screen.getByText('16/50')).toBeTruthy()
    // ...mais le niveau affiché n'est ni celui du quiz (Beginner) ni celui, réévalué par l'admin
    // après l'appel (Advanced), passé en `niveau_evalue` : la ligne entière a disparu plutôt que
    // d'afficher l'un ou l'autre sous une étiquette qui ne lui correspond plus.
    expect(screen.queryByText('Advanced')).toBeNull()
    expect(screen.queryByText('Niveau estimé provisoire')).toBeNull()
  })

  it('déplie le détail des réponses au clic', () => {
    render(<BlocResultatQuiz diagnostic={{ niveau_evalue: 'Beginner', notes: notesAvecBilan }} />)

    expect(screen.queryByText(/Points à revoir/)).toBeNull()
    fireEvent.click(screen.getByText('Voir le détail des réponses'))
    expect(screen.getByText(/Points à revoir/)).toBeTruthy()
  })

  it('ne rend rien sans diagnostic', () => {
    const { container } = render(<BlocResultatQuiz diagnostic={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  /* Un diagnostic sans quiz écrit (appel diagnostic classique, sans parcours de réservation en
     ligne) n'a ni score ni bilan détaillé : rien à afficher, même avec `afficherNiveau`. */
  it('ne rend rien pour un diagnostic sans quiz écrit', () => {
    const { container } = render(<BlocResultatQuiz diagnostic={{ niveau_evalue: null, notes: null }} />)
    expect(container).toBeEmptyDOMElement()
  })

  /* Un dossier ancien, sans bilan multi-lignes : au moins le niveau doit suffire à afficher
     quelque chose, comme avant cette évolution. */
  it('affiche au moins le niveau quand il n’y a ni score ni bilan détaillé', () => {
    render(<BlocResultatQuiz diagnostic={{ niveau_evalue: 'Intermediate', notes: null }} />)
    expect(screen.getByText('Intermediate')).toBeTruthy()
  })
})
