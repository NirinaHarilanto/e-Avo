import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChampDate } from '../ChampDate'

function Formulaire() {
  const [date, setDate] = useState('2026-09-29')
  return (
    <>
      <ChampDate type="date" aria-label="Échéance" value={date} onChange={(e) => setDate(e.target.value)} />
      <output data-testid="retenue">{date}</output>
    </>
  )
}

describe('ChampDate', () => {
  it('garde la date choisie en brouillon jusqu’à « Valider »', () => {
    render(<Formulaire />)
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-10-15' } })
    expect(screen.getByTestId('retenue').textContent).toBe('2026-09-29')

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(screen.getByTestId('retenue').textContent).toBe('2026-10-15')
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull()
  })

  it('transmet le brouillon quand on quitte le champ, sans rien perdre', () => {
    render(<Formulaire />)
    const champ = screen.getByLabelText('Échéance')
    fireEvent.change(champ, { target: { value: '2026-11-02' } })
    fireEvent.blur(champ)
    expect(screen.getByTestId('retenue').textContent).toBe('2026-11-02')
  })

  it('valide avec Entrée', () => {
    render(<Formulaire />)
    const champ = screen.getByLabelText('Échéance')
    fireEvent.change(champ, { target: { value: '2026-12-24' } })
    fireEvent.keyDown(champ, { key: 'Enter' })
    expect(screen.getByTestId('retenue').textContent).toBe('2026-12-24')
  })
})
