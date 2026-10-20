/// <reference types="node" />
// Doit être posé AVANT tout usage de `Date` dans ce fichier — Node applique `TZ` aux accesseurs
// locaux (`getFullYear`, `getDate`…) pour chaque `new Date(...)` créée APRÈS ce changement, pas
// rétroactivement. Simule un admin connecté depuis Madagascar (UTC+3), comme en production :
// c'est précisément le décalage qui provoquait le bug (capture client du 2026-10-20).
process.env.TZ = 'Indian/Antananarivo'

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlanifierSeancesForfait } from '../PlanifierSeancesForfait'

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { access_token: 'jeton-test' } }),
}))

// `ChampDate` ne transmet sa valeur au formulaire qu'à la validation (flou ou Entrée) — remplir
// puis quitter le champ, comme le ferait une personne au clavier.
function remplirDate(input: HTMLInputElement, valeur: string) {
  fireEvent.change(input, { target: { value: valeur } })
  fireEvent.blur(input)
}

describe('PlanifierSeancesForfait — fuseau horaire', () => {
  it('ne recule pas d’un jour le créneau « Du » saisi (bug client du 2026-10-20, Madagascar UTC+3)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sessionIds: ['s1'] }) })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <PlanifierSeancesForfait
        studentIds={['eleve-1']}
        onCree={() => {}}
      />,
    )

    // « Du » : mardi 20/10/2026 — on choisit « Mar » (jour=2) pour que ce jour précis, et lui
    // seul dans la plage, compte comme une séance.
    const selectJour = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(selectJour, { target: { value: '2' } })

    const [champDu, champAu] = [...container.querySelectorAll('input[type="date"]')] as HTMLInputElement[]
    remplirDate(champDu, '2026-10-20')
    remplirDate(champAu, '2026-10-21')

    const boutonPlanifier = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Planifier')!
    fireEvent.click(boutonPlanifier)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const corps = JSON.parse(fetchMock.mock.calls[0][1].body)

    // Avant la correction, `toISOString().slice(0,10)` convertissait d'abord en UTC et faisait
    // retomber le mardi 20/10 local sur le lundi 19/10 — un autre jour de la semaine, qui ne
    // correspond plus au créneau « Mar » choisi : la séance partait silencieusement un jour trop
    // tôt, hors de la plage affichée à l'écran. Vérifié reproduit avant correction (ISO
    // 2026-10-19T…) ; la version corrigée doit tomber sur le 20.
    expect(corps.debuts).toHaveLength(1)
    expect(corps.debuts[0]).toMatch(/^2026-10-20T/)
  })
})
