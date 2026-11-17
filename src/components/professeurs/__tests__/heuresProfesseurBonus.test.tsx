import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

/* Bout en bout de la demande client du 2026-11-18 sur l'écran « Mes heures » du professeur :
   la tuile Bonus y figure, porte « Voir » (jamais « Modifier », réservé à l'admin) et ouvre
   l'historique en lecture seule. */

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ profile: { id: 'prof-1', prenom: 'Patricia', nom: 'ANDRIAMIFIDISOA' } }),
}))
vi.mock('../../layout/ProfesseurLayout', () => ({
  ProfesseurLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../../hooks/useCalendrierProfesseur', () => ({
  useCalendrierProfesseur: () => ({ seances: [], heuresEnseignees: 0, loading: false }),
}))

const bonusRetournes = [
  { id: 'b-1', montant: 10000, motif: 'Renouvellement du forfait de Aina', accorde_le: '2026-11-10', teacher_payment_id: null },
]
vi.mock('../../../hooks/useBonusProfesseur', () => ({
  useBonusProfesseur: () => ({ bonus: bonusRetournes, loading: false, erreur: null, recharger: () => {} }),
}))

vi.mock('../KpiSatisfaction', () => ({ KpiSatisfaction: () => null }))
vi.mock('../PrestationsExternes', () => ({ PrestationsExternes: () => null }))
vi.mock('../TimesheetProfesseur', () => ({ TimesheetProfesseur: () => null }))

const { HeuresProfesseur } = await import('../HeuresProfesseur')

describe('HeuresProfesseur — tuile Bonus', () => {
  it('affiche la tuile avec le bouton « Voir », jamais « Modifier »', () => {
    render(
      <MemoryRouter>
        <HeuresProfesseur />
      </MemoryRouter>,
    )

    expect(screen.getByText('Bonus')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voir' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
  })

  it('ouvre l’historique en lecture seule au clic sur « Voir »', () => {
    render(
      <MemoryRouter>
        <HeuresProfesseur />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Voir' }))

    expect(screen.getByText('Bonus · Patricia ANDRIAMIFIDISOA')).toBeTruthy()
    expect(screen.getByText('Renouvellement du forfait de Aina')).toBeTruthy()
    expect(screen.queryByText('Renouvellements repérés')).toBeNull()
  })
})
