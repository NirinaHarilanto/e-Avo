import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { ChampSelectionPersonnes, type PersonneSelectionnable } from '../ChampSelectionPersonnes'

/* Demande client du 2026-10-30 : « il faut que l'ajout et la recherche des étudiants soient
   similaires à l'ajout d'un expéditeur dans un mail d'Outlook (mécanisme pareil) ».
   Ce mécanisme-là tient en quelques gestes, et c'est eux qui sont verrouillés ici — aucun n'est
   visible à la relecture du composant, tous se perdraient à la première refonte du style. */

const PERSONNES: PersonneSelectionnable[] = [
  { id: 'a', libelle: 'Anaïs RASOANAIVO', detail: 'Vague Novembre · Beginner' },
  { id: 'b', libelle: 'Bruno ANDRIA', detail: 'Vague Novembre · Intermediate' },
  { id: 'c', libelle: 'Chloé BETUM', detail: 'Vague Octobre · Advanced' },
]

function Harnais({ maximum, onChange }: { maximum?: number; onChange?: (ids: string[]) => void } = {}) {
  const [selection, setSelection] = useState<string[]>([])
  return (
    <ChampSelectionPersonnes
      personnes={PERSONNES}
      selection={selection}
      onChange={(ids) => {
        setSelection(ids)
        onChange?.(ids)
      }}
      placeholder="Rechercher un étudiant…"
      maximum={maximum}
    />
  )
}

function champ() {
  return screen.getByLabelText('Rechercher un étudiant…') as HTMLInputElement
}

describe('ChampSelectionPersonnes', () => {
  it('filtre les suggestions à la frappe, accents ignorés', () => {
    render(<Harnais />)
    fireEvent.focus(champ())
    fireEvent.change(champ(), { target: { value: 'anais' } })

    expect(screen.getByText('Anaïs RASOANAIVO')).toBeTruthy()
    expect(screen.queryByText('Bruno ANDRIA')).toBeNull()
  })

  it('cherche aussi dans le détail, et sur plusieurs mots', () => {
    render(<Harnais />)
    fireEvent.focus(champ())
    fireEvent.change(champ(), { target: { value: 'octobre advanced' } })

    expect(screen.getByText('Chloé BETUM')).toBeTruthy()
    expect(screen.queryByText('Bruno ANDRIA')).toBeNull()
  })

  it('pose un jeton au clic, vide la recherche et retire la personne des suggestions', () => {
    render(<Harnais />)
    fireEvent.focus(champ())
    fireEvent.change(champ(), { target: { value: 'bruno' } })
    fireEvent.click(screen.getByText('Bruno ANDRIA'))

    expect(screen.getByLabelText('Retirer Bruno ANDRIA')).toBeTruthy()
    expect(champ().value).toBe('')

    // Une personne déjà choisie ne se propose plus.
    fireEvent.change(champ(), { target: { value: 'bruno' } })
    expect(screen.queryByRole('button', { name: /Vague Novembre · Intermediate/ })).toBeNull()
  })

  it('choisit à la flèche + Entrée, sans quitter le champ', () => {
    render(<Harnais />)
    fireEvent.focus(champ())
    fireEvent.keyDown(champ(), { key: 'ArrowDown' })
    fireEvent.keyDown(champ(), { key: 'Enter' })

    // ArrowDown part de l'index 0 et avance d'un cran : c'est la DEUXIÈME de la liste.
    expect(screen.getByLabelText('Retirer Bruno ANDRIA')).toBeTruthy()
  })

  it('retire le dernier jeton au Retour arrière quand la recherche est vide', () => {
    render(<Harnais />)
    fireEvent.focus(champ())
    fireEvent.change(champ(), { target: { value: 'anais' } })
    fireEvent.click(screen.getByText('Anaïs RASOANAIVO'))
    expect(screen.getByLabelText('Retirer Anaïs RASOANAIVO')).toBeTruthy()

    fireEvent.keyDown(champ(), { key: 'Backspace' })
    expect(screen.queryByLabelText('Retirer Anaïs RASOANAIVO')).toBeNull()
  })

  it('ne retire rien au Retour arrière tant qu’il reste du texte à effacer', () => {
    render(<Harnais />)
    fireEvent.focus(champ())
    fireEvent.change(champ(), { target: { value: 'anais' } })
    fireEvent.click(screen.getByText('Anaïs RASOANAIVO'))
    fireEvent.change(champ(), { target: { value: 'bru' } })

    fireEvent.keyDown(champ(), { key: 'Backspace' })
    expect(screen.getByLabelText('Retirer Anaïs RASOANAIVO')).toBeTruthy()
  })

  it('cesse de proposer au maximum atteint, et le dit', () => {
    const onChange = vi.fn()
    render(<Harnais maximum={1} onChange={onChange} />)
    fireEvent.focus(champ())
    fireEvent.change(champ(), { target: { value: 'anais' } })
    fireEvent.click(screen.getByText('Anaïs RASOANAIVO'))

    expect(champ().placeholder).toBe('Maximum atteint (1)')
    expect(screen.queryByText('Bruno ANDRIA')).toBeNull()
  })

  it('n’empêche pas de corriger : un jeton retiré redevient proposable', () => {
    render(<Harnais maximum={1} />)
    fireEvent.focus(champ())
    fireEvent.change(champ(), { target: { value: 'anais' } })
    fireEvent.click(screen.getByText('Anaïs RASOANAIVO'))
    fireEvent.click(screen.getByLabelText('Retirer Anaïs RASOANAIVO'))

    fireEvent.focus(champ())
    fireEvent.change(champ(), { target: { value: 'anais' } })
    expect(screen.getByText('Anaïs RASOANAIVO')).toBeTruthy()
  })
})
