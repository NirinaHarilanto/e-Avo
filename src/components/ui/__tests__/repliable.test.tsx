import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ListeRepliable, TexteRepliable } from '../Repliable'

describe('ListeRepliable', () => {
  it('ne montre que les premiers éléments et annonce combien restent', () => {
    render(
      <ListeRepliable visibles={2} nom="séances">
        {['A', 'B', 'C', 'D', 'E'].map((x) => (
          <p key={x}>Séance {x}</p>
        ))}
      </ListeRepliable>,
    )

    expect(screen.getByText('Séance A')).toBeInTheDocument()
    expect(screen.getByText('Séance B')).toBeInTheDocument()
    expect(screen.queryByText('Séance C')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'voir les 3 autres séances…' })).toBeInTheDocument()
  })

  it('déplie puis replie la liste', () => {
    render(
      <ListeRepliable visibles={2} nom="séances">
        {['A', 'B', 'C'].map((x) => (
          <p key={x}>Séance {x}</p>
        ))}
      </ListeRepliable>,
    )

    // Un seul élément masqué : libellé au singulier, « voir les 1 autres séances » serait fautif.
    fireEvent.click(screen.getByRole('button', { name: 'voir 1 de plus…' }))
    expect(screen.getByText('Séance C')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'voir moins…' }))
    expect(screen.queryByText('Séance C')).not.toBeInTheDocument()
  })

  it("n'affiche aucun bouton quand la liste tient déjà en entier", () => {
    render(
      <ListeRepliable visibles={3} nom="séances">
        {['A', 'B'].map((x) => (
          <p key={x}>Séance {x}</p>
        ))}
      </ListeRepliable>,
    )

    expect(screen.getByText('Séance A')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('TexteRepliable', () => {
  /* jsdom ne fait aucune mise en page : scrollHeight et clientHeight y valent toujours 0, donc
     le texte n'est jamais détecté comme dépassant et le lien « voir plus » reste absent. Ce test
     couvre donc ce qu'on peut vérifier sans moteur de rendu : le texte est bien affiché en
     entier dans le DOM (rien n'est perdu, la coupe est purement visuelle via CSS line-clamp). */
  it('rend le texte complet dans le DOM', () => {
    render(<TexteRepliable texte="Un résumé de séance assez long pour être coupé à l'affichage." />)
    expect(screen.getByText("Un résumé de séance assez long pour être coupé à l'affichage.")).toBeInTheDocument()
  })
})
