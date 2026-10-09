import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BoutonEnregistrer } from '../BoutonEnregistrer'

describe('BoutonEnregistrer', () => {
  it('affiche le libellé de repos par défaut, et reste cliquable', () => {
    const onClick = vi.fn()
    render(<BoutonEnregistrer enCours={false} enregistre={false} onClick={onClick} />)
    const bouton = screen.getByRole('button', { name: 'Enregistrer' })
    expect(bouton).not.toBeDisabled()
    fireEvent.click(bouton)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('affiche « Enregistrement… » et se désactive pendant l’envoi', () => {
    render(<BoutonEnregistrer enCours enregistre={false} onClick={() => {}} />)
    const bouton = screen.getByRole('button', { name: 'Enregistrement…' })
    expect(bouton).toBeDisabled()
  })

  it('affiche « Enregistré » une fois le succès marqué, et reste cliquable (ré-enregistrer)', () => {
    render(<BoutonEnregistrer enCours={false} enregistre onClick={() => {}} />)
    const bouton = screen.getByRole('button', { name: /Enregistré/ })
    expect(bouton).not.toBeDisabled()
  })

  it('priorise l’état « en cours » même si `enregistre` reste vrai (ré-enregistrement en cours)', () => {
    render(<BoutonEnregistrer enCours enregistre onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeTruthy()
    expect(screen.queryByText('Enregistré')).toBeNull()
  })
})
