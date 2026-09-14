import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { EnTetePage } from '../EnTetePage'
import { GuidePage } from '../GuidePage'
import { Section } from '../Section'
import { EtatVide } from '../EtatVide'
import { EtatChargement, MessageErreur } from '../Etats'
import { GrilleStats, Stat } from '../Stat'
import { Onglets } from '../Onglets'
import { ChampRecherche } from '../BarreOutils'

/* Le socle ui/ est monté par les quatre espaces : une régression ici casse toutes les pages à
   la fois. Ces tests couvrent le rendu et les deux comportements qui portent de l'état — le
   repli mémorisé du guide et la sélection d'onglet. */

beforeEach(() => {
  localStorage.clear()
})

describe('EnTetePage', () => {
  it('affiche le titre, la description et les actions', () => {
    render(<EnTetePage titre="Étudiants" description="Suivez chaque dossier." actions={<button>Ajouter</button>} />)
    expect(screen.getByRole('heading', { name: 'Étudiants' })).toBeInTheDocument()
    expect(screen.getByText('Suivez chaque dossier.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
  })
})

describe('GuidePage', () => {
  it('est ouvert au premier accès et liste ses étapes', () => {
    render(<GuidePage id="test-guide" etapes={['Première étape', 'Seconde étape']} />)
    expect(screen.getByText('Première étape')).toBeInTheDocument()
    expect(screen.getByText('Seconde étape')).toBeInTheDocument()
  })

  it('se replie au clic et mémorise le choix pour la page suivante', () => {
    const { unmount } = render(<GuidePage id="test-guide" etapes={['Première étape']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }))
    expect(screen.queryByText('Première étape')).not.toBeInTheDocument()
    unmount()

    render(<GuidePage id="test-guide" etapes={['Première étape']} />)
    expect(screen.queryByText('Première étape')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Afficher' })).toBeInTheDocument()
  })

  it("garde un repli propre à chaque page plutôt qu'un réglage global", () => {
    const { unmount } = render(<GuidePage id="guide-a" etapes={['Étape A']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }))
    unmount()

    render(<GuidePage id="guide-b" etapes={['Étape B']} />)
    expect(screen.getByText('Étape B')).toBeInTheDocument()
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
