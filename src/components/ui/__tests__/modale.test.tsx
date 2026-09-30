import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modale } from '../Modale'

describe('Modale', () => {
  /* jsdom ne calcule aucune mise en page : il ne peut pas reproduire le symptôme visuel (un
     ancêtre `transform` devient le bloc conteneur des descendants `position: fixed`, qui se
     retrouvent rognés à la taille de la carte au lieu de couvrir la fenêtre). Ce qu'il peut
     vérifier, et qui suffit à garantir l'absence de rechute, c'est la cause : la fenêtre ne doit
     jamais rester imbriquée dans l'élément qui l'ouvre — cas d'un binôme DUO, dont la fiche est
     rendue à l'intérieur de la carte `.card-lift` du groupe (0058). */
  it('se monte dans document.body, hors de la carte qui l’ouvre', () => {
    const { container } = render(
      <div className="card card-lift">
        <Modale titre="Sandra Ramavo" onFermer={() => {}}>
          <p>Détail du prospect</p>
        </Modale>
      </div>,
    )

    const carte = container.querySelector('.card-lift')!
    const dialogue = screen.getByRole('dialog')
    expect(dialogue).toBeInTheDocument()
    expect(carte.contains(dialogue)).toBe(false)
    expect(document.body.contains(dialogue)).toBe(true)
  })

  /* Fiche prospect → fenêtre de paiement ou de planification : deux Modale emboîtées, désormais
     montées côte à côte dans `document.body`. Refermer celle du dessus ne doit pas refermer
     celle du dessous, sans quoi l'admin perdrait la fiche à chaque acompte saisi. React propage
     les événements d'un portail le long de l'arbre React, donc le `stopPropagation` du cadre de
     la fenêtre parente continue de les intercepter — ce test le verrouille. */
  it('ne referme pas la fenêtre parente quand on ferme une fenêtre imbriquée', () => {
    const fermerParent = vi.fn()
    const fermerEnfant = vi.fn()

    render(
      <Modale titre="Fiche prospect" onFermer={fermerParent}>
        <Modale titre="Paiement" onFermer={fermerEnfant}>
          <p>Montant</p>
        </Modale>
      </Modale>,
    )

    const voileEnfant = screen.getByRole('dialog', { name: 'Paiement' }).parentElement!
    fireEvent.click(voileEnfant)

    expect(fermerEnfant).toHaveBeenCalledTimes(1)
    expect(fermerParent).not.toHaveBeenCalled()
  })

  /* Piège propre au portail : React insère la fenêtre imbriquée AVANT sa parente dans
     `document.body`. À z-index égal, la parente passerait donc devant et masquerait la fenêtre
     qu'on vient d'ouvrir — l'inverse de ce qui se passait quand l'imbriquée était rendue dans le
     cadre de sa parente. */
  it('affiche une fenêtre imbriquée par-dessus sa parente', () => {
    render(
      <Modale titre="Fiche prospect" onFermer={() => {}}>
        <Modale titre="Paiement" onFermer={() => {}}>
          <p>Montant</p>
        </Modale>
      </Modale>,
    )

    const zIndex = (nom: string) =>
      Number((screen.getByRole('dialog', { name: nom }).parentElement as HTMLElement).style.zIndex)

    expect(zIndex('Paiement')).toBeGreaterThan(zIndex('Fiche prospect'))
  })

  it('ne fait réagir à Échap que la fenêtre du dessus', () => {
    const fermerParent = vi.fn()
    const fermerEnfant = vi.fn()

    render(
      <Modale titre="Fiche prospect" onFermer={fermerParent}>
        <Modale titre="Paiement" onFermer={fermerEnfant}>
          <p>Montant</p>
        </Modale>
      </Modale>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(fermerEnfant).toHaveBeenCalledTimes(1)
    expect(fermerParent).not.toHaveBeenCalled()
  })

  it('rend Échap à la fenêtre restante une fois celle du dessus refermée', () => {
    const fermerParent = vi.fn()

    function Pile({ paiementOuvert }: { paiementOuvert: boolean }) {
      return (
        <Modale titre="Fiche prospect" onFermer={fermerParent}>
          {paiementOuvert && (
            <Modale titre="Paiement" onFermer={() => {}}>
              <p>Montant</p>
            </Modale>
          )}
        </Modale>
      )
    }

    const { rerender } = render(<Pile paiementOuvert />)
    rerender(<Pile paiementOuvert={false} />)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(fermerParent).toHaveBeenCalledTimes(1)
  })

  /* `fermetureExterieureDesactivee` (demande client du 2026-09-30, pour les checklists : « le
     seul moyen de quitter la checklist [doit être] le petit croix en haut à droite. Toute clique
     à l'extérieure ne la fermera pas ») — comportement par défaut d'abord (inchangé), puis le
     comportement dédié. Une régression ici romprait silencieusement soit les dizaines de popups
     existantes qui ferment au clic extérieur/Échap, soit la protection anti-perte de saisie
     qu'on vient d'ajouter pour la fiche candidat. */
  it('se ferme par défaut au clic sur le voile extérieur', () => {
    const onFermer = vi.fn()
    render(
      <Modale titre="Titre" onFermer={onFermer}>
        <p>Contenu</p>
      </Modale>,
    )
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onFermer).toHaveBeenCalledTimes(1)
  })

  it('ignore le clic extérieur et Échap quand fermetureExterieureDesactivee est posé', () => {
    const onFermer = vi.fn()
    render(
      <Modale titre="Checklist" onFermer={onFermer} fermetureExterieureDesactivee>
        <p>Contenu</p>
      </Modale>,
    )
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onFermer).not.toHaveBeenCalled()
  })

  it('la croix ferme toujours la fenêtre, même avec fermetureExterieureDesactivee', () => {
    const onFermer = vi.fn()
    render(
      <Modale titre="Checklist" onFermer={onFermer} fermetureExterieureDesactivee>
        <p>Contenu</p>
      </Modale>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onFermer).toHaveBeenCalledTimes(1)
  })

  it('un clic à l’intérieur de la fenêtre ne la ferme jamais, avec ou sans le réglage', () => {
    const onFermer = vi.fn()
    render(
      <Modale titre="Titre" onFermer={onFermer} fermetureExterieureDesactivee>
        <p>Contenu</p>
      </Modale>,
    )
    fireEvent.click(screen.getByText('Contenu'))
    expect(onFermer).not.toHaveBeenCalled()
  })
})
