import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvertissementDureeMeet } from '../AvertissementDureeMeet'

/* La limite de 60 min ne concerne que les réunions à 3 participants ou plus (professeur
   compris) : l'avertissement ne doit jamais s'afficher sur un cours individuel, sous peine
   d'être ignoré quand il compte vraiment. */
describe('AvertissementDureeMeet', () => {
  it('se tait sur un cours individuel, même long', () => {
    const { container } = render(<AvertissementDureeMeet dureeMinutes={120} nombreEleves={1} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('se tait sur un cours collectif d’une heure ou moins', () => {
    const { container } = render(<AvertissementDureeMeet dureeMinutes={60} nombreEleves={4} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('avertit sur un cours collectif de plus d’une heure', () => {
    render(<AvertissementDureeMeet dureeMinutes={90} nombreEleves={2} />)
    expect(screen.getByText(/3 participants pendant 90 minutes/)).toBeInTheDocument()
  })
})
