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
     les événements d'un portail le long de l'arbre React, donc le `stopPropagation` du voile de
     la fenêtre enfant continue de les intercepter — ce test le verrouille. */
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

    /* Par la croix, et non plus par le voile : depuis le 2026-11-08 aucun clic extérieur ne
       ferme plus rien (voir le bloc « règle générale » en fin de fichier). */
    const croixEnfant = screen.getByRole('dialog', { name: 'Paiement' }).querySelector('button[aria-label="Fermer"]')!
    fireEvent.click(croixEnfant)

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

  /* RÈGLE GÉNÉRALE posée par le client le 2026-11-08 : « quand un pop-up apparaît et que l'on
     clique à l'extérieur du pop-up, il ne faut pas fermer le pop-up, c'est une règle à respecter
     sur tous les pop-up. » Elle vivait jusque-là au cas par cas — la réservation publique depuis
     le 2026-10-19 (un clic à côté effaçait un quiz de 67 questions), les checklists depuis le
     2026-09-30 — et c'est ce bloc qui l'impose maintenant à toute fenêtre passant par ce
     composant, soit la quasi-totalité de l'application. */
  it('ne se ferme JAMAIS au clic sur le voile extérieur', () => {
    const onFermer = vi.fn()
    render(
      <Modale titre="Titre" onFermer={onFermer}>
        <p>Contenu</p>
      </Modale>,
    )
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onFermer).not.toHaveBeenCalled()
  })

  it('un clic à l’intérieur de la fenêtre ne la ferme pas davantage', () => {
    const onFermer = vi.fn()
    render(
      <Modale titre="Titre" onFermer={onFermer}>
        <p>Contenu</p>
      </Modale>,
    )
    fireEvent.click(screen.getByText('Contenu'))
    expect(onFermer).not.toHaveBeenCalled()
  })

  /* Un clic ne doit pas non plus ATTEINDRE ce qui a ouvert la fenêtre : les événements d'un
     portail remontent l'arbre React, pas le DOM. Sans `stopPropagation` sur le voile, un clic
     dans une fenêtre ouverte depuis une ligne de tableau cliquable rejouerait le clic de la
     ligne — invisible en développement, déroutant en production. */
  it('ne laisse aucun clic remonter jusqu’à l’élément qui l’a ouverte', () => {
    const clicAncetre = vi.fn()
    render(
      <div onClick={clicAncetre}>
        <Modale titre="Titre" onFermer={() => {}}>
          <p>Contenu</p>
        </Modale>
      </div>,
    )

    fireEvent.click(screen.getByText('Contenu'))
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(clicAncetre).not.toHaveBeenCalled()
  })

  /* Échap reste un geste DÉLIBÉRÉ, donc toujours actif — sauf là où le client a demandé que seule
     la croix ferme (checklists, 2026-09-30), ce que porte désormais `fermetureEchapDesactivee`,
     renommé puisque la part « extérieure » est devenue inconditionnelle. */
  it('ignore Échap quand fermetureEchapDesactivee est posé', () => {
    const onFermer = vi.fn()
    render(
      <Modale titre="Checklist" onFermer={onFermer} fermetureEchapDesactivee>
        <p>Contenu</p>
      </Modale>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onFermer).not.toHaveBeenCalled()
  })

  it('la croix ferme toujours la fenêtre, réglage ou non', () => {
    const onFermer = vi.fn()
    render(
      <Modale titre="Checklist" onFermer={onFermer} fermetureEchapDesactivee>
        <p>Contenu</p>
      </Modale>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onFermer).toHaveBeenCalledTimes(1)
  })
})
