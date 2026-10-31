import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PageEquipe } from '../PageEquipe'
import { AVIS_PROFESSEURS } from '../PreuveSociale'

/* Hero « Notre équipe », d'après la maquette client du 2026-10-29.

   Le point qui mérite un test : « Réserver mon appel diagnostic » doit mener à `?reserver=1`,
   le seul paramètre que la page Cours & tarifs sait traduire en « fenêtre ouverte sur l'onglet
   Réserver ». Un lien vers `/cours` tout court afficherait la page sans rien ouvrir, et le
   bouton paraîtrait pourtant fonctionner. */

describe('Hero « Notre équipe »', () => {
  it('mène à la réservation de l’appel diagnostic, pas à la simple page des cours', () => {
    render(
      <MemoryRouter>
        <PageEquipe dossierAssets="/etablissements/hari-online-course" />
      </MemoryRouter>,
    )
    const lien = screen.getByRole('link', { name: /réserver mon appel diagnostic/i })
    expect(lien.getAttribute('href')).toBe('/cours?reserver=1')
  })

  it('affiche les chiffres clés et l’avis d’un élève', () => {
    render(
      <MemoryRouter>
        <PageEquipe dossierAssets="/etablissements/hari-online-course" />
      </MemoryRouter>,
    )
    /* L'échelle des maquettes était le CECRL ; HOC n'en emploie plus qu'une depuis le
       2026-10-31, celle de ses classes — le visiteur lit les mêmes mots que l'élève
       retrouvera sur son dossier. */
    expect(screen.getByText('Beginner → Advanced')).toBeTruthy()
    expect(screen.getByText('+ de 500')).toBeTruthy()
    expect(screen.getByText(AVIS_PROFESSEURS.citation)).toBeTruthy()
    expect(screen.getByText('Ils vous accompagnent en visio, à votre rythme')).toBeTruthy()
  })
})
