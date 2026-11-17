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
const extrasRetournes = [
  { id: 'e-1', montant: 50000, type_prestation: 'Atelier', date_prestation: '2026-11-15', lieu: 'En ligne', duree_minutes: 90, statut: 'validee', teacher_payment_id: null },
]
vi.mock('../../../hooks/useBonusProfesseur', () => ({
  useBonusProfesseur: () => ({ bonus: bonusRetournes, loading: false, erreur: null, recharger: () => {} }),
  usePrestationsExtra: () => ({ extras: extrasRetournes, loading: false, erreur: null, recharger: () => {} }),
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
    // Deux tuiles portent « Voir » (Bonus puis Extra) : aucune ne doit porter « Modifier ».
    expect(screen.getAllByRole('button', { name: 'Voir' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
  })

  it('ouvre l’historique en lecture seule au clic sur « Voir »', () => {
    render(
      <MemoryRouter>
        <HeuresProfesseur />
      </MemoryRouter>,
    )

    // La première tuile « Voir » est celle des bonus, qui précède Extra dans la grille.
    fireEvent.click(screen.getAllByRole('button', { name: 'Voir' })[0])

    expect(screen.getByText('Bonus · Patricia ANDRIAMIFIDISOA')).toBeTruthy()
    expect(screen.getByText('Renouvellement du forfait de Aina')).toBeTruthy()
    expect(screen.queryByText('Renouvellements repérés')).toBeNull()
  })
})

/* Demande client du 2026-11-17 : le bloc Extra est « visible du côté professeur en mode lecture
   uniquement », et son bouton dit « Voir » comme celui des bonus. */
describe('HeuresProfesseur — tuile Extra', () => {
  it('affiche la tuile Extra à côté de celle des bonus', () => {
    render(
      <MemoryRouter>
        <HeuresProfesseur />
      </MemoryRouter>,
    )

    expect(screen.getByText('Extra')).toBeTruthy()
    // Deux tuiles portent désormais « Voir » : les bonus et les prestations.
    expect(screen.getAllByRole('button', { name: 'Voir' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
  })

  it('ouvre l’historique des prestations en lecture seule', () => {
    render(
      <MemoryRouter>
        <HeuresProfesseur />
      </MemoryRouter>,
    )

    // La seconde tuile « Voir » est celle des prestations (Bonus vient avant Extra).
    fireEvent.click(screen.getAllByRole('button', { name: 'Voir' })[1])

    expect(screen.getByText('Extra · Patricia ANDRIAMIFIDISOA')).toBeTruthy()
    expect(screen.getByText('Atelier (15/11/2026) · En ligne')).toBeTruthy()
    expect(screen.queryByText('Attribuer la prestation')).toBeNull()
  })
})
