import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { AgendaHebdo } from '../AgendaHebdo'
import { lundiDeLaSemaine, type EvenementAgenda } from '../../../lib/agenda'

/* La grille est montée par les trois espaces : admin, professeur et étudiant. jsdom n'implémente
   ni matchMedia ni scrollTo, les deux sont donc fournis ici. */
beforeAll(() => {
  window.matchMedia = ((requete: string) => ({
    matches: false,
    media: requete,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  Element.prototype.scrollTo = () => {}
})

const LUNDI = lundiDeLaSemaine(new Date('2026-09-14T10:00'))

const COURS: EvenementAgenda[] = [
  {
    id: 'seance-1',
    debut: new Date('2026-09-15T09:00').toISOString(),
    dureeMinutes: 60,
    titre: 'Hery Rakoto',
    sousTitre: 'Individuel · 60 min',
  },
  {
    id: 'seance-2',
    debut: new Date('2026-09-17T18:30').toISOString(),
    dureeMinutes: 90,
    titre: 'Vague Anglais B1',
    ton: 'teal',
  },
]

describe('AgendaHebdo', () => {
  it('affiche les cours de la semaine et les sept jours', () => {
    render(<AgendaHebdo evenements={COURS} semaineDebut={LUNDI} onSemaineChange={() => {}} />)
    expect(screen.getByText('Hery Rakoto')).toBeInTheDocument()
    expect(screen.getByText('Vague Anglais B1')).toBeInTheDocument()
    expect(screen.getByText('14 – 20 septembre 2026')).toBeInTheDocument()
    // Un en-tête par jour : les numéros du 14 au 20.
    for (const jour of [14, 15, 16, 17, 18, 19, 20]) {
      expect(screen.getAllByText(String(jour)).length).toBeGreaterThan(0)
    }
  })

  it('navigue d’une semaine à l’autre', () => {
    const onSemaineChange = vi.fn()
    render(<AgendaHebdo evenements={COURS} semaineDebut={LUNDI} onSemaineChange={onSemaineChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Semaine suivante' }))
    expect(onSemaineChange.mock.calls[0][0].getDate()).toBe(21)

    fireEvent.click(screen.getByRole('button', { name: 'Semaine précédente' }))
    expect(onSemaineChange.mock.calls[1][0].getDate()).toBe(7)
  })

  it('remonte l’événement cliqué', () => {
    const onSelectionner = vi.fn()
    render(<AgendaHebdo evenements={COURS} semaineDebut={LUNDI} onSemaineChange={() => {}} onSelectionner={onSelectionner} />)
    fireEvent.click(screen.getByText('Hery Rakoto'))
    expect(onSelectionner).toHaveBeenCalledWith(expect.objectContaining({ id: 'seance-1' }))
  })

  it('rend les cours non cliquables quand aucune sélection n’est permise', () => {
    render(<AgendaHebdo evenements={COURS} semaineDebut={LUNDI} onSemaineChange={() => {}} />)
    expect(screen.getByText('Hery Rakoto').closest('button')).toBeDisabled()
  })

  it('affiche le message de semaine vide et cache l’astuce sans création possible', () => {
    render(<AgendaHebdo evenements={[]} semaineDebut={LUNDI} onSemaineChange={() => {}} videMessage="Aucun cours cette semaine." />)
    expect(screen.getByText('Aucun cours cette semaine.')).toBeInTheDocument()
    expect(screen.queryByText(/cliquez directement sur un créneau libre/i)).not.toBeInTheDocument()
  })

  it('propose la création sur créneau libre quand c’est permis', () => {
    render(<AgendaHebdo evenements={COURS} semaineDebut={LUNDI} onSemaineChange={() => {}} onCreneauLibre={() => {}} />)
    expect(screen.getByText(/cliquez directement sur un créneau libre/i)).toBeInTheDocument()
  })
})
