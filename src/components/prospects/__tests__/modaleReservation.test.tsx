import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-19, capture à l'appui : un clic accidentel à côté du quiz de
   positionnement (jusqu'à 67 questions chronométrées) ou du formulaire de réservation (nom,
   e-mail, téléphone, objectif, parfois un binôme entier) refermait tout sans confirmation.
   « Il ne faut pas que la fenêtre se ferme [au clic extérieur]. Elle se fermera uniquement si
   l'utilisateur clique sur le bouton fermer "X". »

   La fenêtre dépend de ReserverAppel (par défaut) ou TestPositionnement (programme collectif),
   toutes deux chargeant des créneaux au montage — `fetch` est donc stubbé pour ne jamais
   échouer, le point testé ici étant uniquement le clic sur le voile, pas le contenu chargé. */

vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({ ok: true, json: async () => ({ jours: [], creneaux: [], etablissement: { nom: 'HOC' } }) })),
)

const { ModaleReservation } = await import('../ModaleReservation')

const accent = {
  accentGrad: 'linear-gradient(90deg,#000,#000)',
  accentInk: '#fff',
} as unknown as Parameters<typeof ModaleReservation>[0]['accent']

beforeEach(() => {
  vi.mocked(fetch).mockClear()
})

describe('ModaleReservation', () => {
  it('ne se ferme pas au clic sur le voile extérieur', () => {
    const onFermer = vi.fn()
    const { container } = render(
      <ModaleReservation etablissementSlug="hari-online-course" etablissementNom="HOC" accent={accent} onFermer={onFermer} />,
    )
    const voile = container.querySelector('.voile-modale')
    expect(voile).toBeTruthy()
    fireEvent.click(voile as Element)
    expect(onFermer).not.toHaveBeenCalled()
  })

  it('se ferme seulement au clic sur la croix', () => {
    const onFermer = vi.fn()
    render(<ModaleReservation etablissementSlug="hari-online-course" etablissementNom="HOC" accent={accent} onFermer={onFermer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onFermer).toHaveBeenCalledTimes(1)
  })

  it('ne se ferme pas non plus au clic extérieur une fois sur le quiz collectif', () => {
    const onFermer = vi.fn()
    const { container } = render(
      <ModaleReservation
        etablissementSlug="hari-online-course"
        etablissementNom="HOC"
        accent={accent}
        typeInitial="collectif"
        onFermer={onFermer}
      />,
    )
    fireEvent.click(container.querySelector('.voile-modale') as Element)
    expect(onFermer).not.toHaveBeenCalled()
  })
})
