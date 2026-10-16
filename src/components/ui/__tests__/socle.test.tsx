import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { EnTetePage } from '../EnTetePage'
import { Section } from '../Section'
import { EtatVide } from '../EtatVide'
import { EtatChargement, MessageErreur } from '../Etats'
import { GrilleStats, Stat } from '../Stat'
import { Onglets } from '../Onglets'
import { ChampRecherche } from '../BarreOutils'

/* Le socle ui/ est monté par les trois espaces connectés : une régression ici casse toutes les
   pages à la fois. Ces tests couvrent le rendu et le seul comportement qui porte de l'état, la
   sélection d'onglet.

   `EnTetePage` rend la cloche de notifications depuis la refonte du 2026-10-16 (la barre
   supérieure qui la portait a disparu), ce qui le fait dépendre du contexte de profil et du
   routeur : d'où le mock ci-dessous et le `MemoryRouter` autour de son rendu. */
vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ notifications: [], notificationsNonLues: 0, marquerNotificationLue: () => {} }),
}))

describe('EnTetePage', () => {
  it('affiche le titre, les actions de la page et les boutons communs', () => {
    render(
      <MemoryRouter>
        <EnTetePage titre="Étudiants" actions={<button>Ajouter</button>} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Étudiants' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualiser la page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })
})

describe('Onglets', () => {
  it('marque l’onglet actif et notifie le changement', () => {
    const vus: string[] = []
    render(
      <Onglets
        actif="devis"
        onChange={(valeur) => vus.push(valeur)}
        onglets={[
          { value: 'devis', label: 'Devis', compteur: 3 },
          { value: 'factures', label: 'Factures' },
        ]}
      />,
    )
    expect(screen.getByRole('tab', { name: /Devis/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Factures/ })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Factures' }))
    expect(vus).toEqual(['factures'])
  })
})

describe('États de page', () => {
  it('un état vide porte un titre et une explication', () => {
    render(<EtatVide titre="Aucun document" description="Déposez un premier fichier." />)
    expect(screen.getByText('Aucun document')).toBeInTheDocument()
    expect(screen.getByText('Déposez un premier fichier.')).toBeInTheDocument()
  })

  it('le chargement est annoncé aux lecteurs d’écran', () => {
    render(<EtatChargement lignes={2} />)
    expect(screen.getByRole('status', { name: 'Chargement en cours' })).toBeInTheDocument()
  })

  it("une erreur est annoncée comme telle", () => {
    render(<MessageErreur>La suppression a échoué.</MessageErreur>)
    expect(screen.getByRole('alert')).toHaveTextContent('La suppression a échoué.')
  })
})

describe('Section et statistiques', () => {
  it('affiche titre, compteur et contenu', () => {
    render(
      <Section titre="Élèves attribués" compteur={4}>
        <p>Contenu</p>
      </Section>,
    )
    expect(screen.getByRole('heading', { name: /Élèves attribués/ })).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Contenu')).toBeInTheDocument()
  })

  it('affiche une valeur avec son unité et son aide', () => {
    render(
      <GrilleStats>
        <Stat libelle="Heures suivies" valeur={12} unite="h" aide="Séances clôturées" />
      </GrilleStats>,
    )
    expect(screen.getByText('Heures suivies')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('h')).toBeInTheDocument()
    expect(screen.getByText('Séances clôturées')).toBeInTheDocument()
  })
})

describe('ChampRecherche', () => {
  it('remonte la saisie et reste accessible au clavier', () => {
    const saisies: string[] = []
    render(<ChampRecherche valeur="" onChange={(v) => saisies.push(v)} placeholder="Rechercher un étudiant…" />)
    const champ = screen.getByRole('searchbox', { name: 'Rechercher un étudiant…' })
    fireEvent.change(champ, { target: { value: 'Rakoto' } })
    expect(saisies).toEqual(['Rakoto'])
  })
})
