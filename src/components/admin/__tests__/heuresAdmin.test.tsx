import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

/* Demande client du 2026-10-20, capture à l'appui : chaque ligne de « Heures & forfaits » ne
   montrait que « Xh suivies », sans dire sur quel forfait — « mettre les heures suivies/forfait
   d'heures en cours ». Et un avertissement rouge doit apparaître à la moitié du forfait, puis à
   3 heures de sa fin — les deux mêmes seuils que la notification admin et l'enquête de
   satisfaction déjà en place (migration 0130, lib/jalonsParcours.ts), jamais une variante
   recalculée ici. */

const bernard = { id: 'eleve-1', prenom: 'bernard', nom: 'bensas' }
const lalaina = { id: 'eleve-2', prenom: 'Lalaina', nom: 'bensas' }

let lignesEtudiants: { profile: typeof bernard; heures: number }[] = []
let etats: Record<string, { forfaitEpuise: boolean; sansCoursPlanifie: boolean; forfait: number | null; consommees: number }> = {}

vi.mock('../../../hooks/useHeuresAdmin', () => ({
  useHeuresAdmin: () => ({ etudiants: lignesEtudiants, professeurs: [], loading: false }),
}))
vi.mock('../../../hooks/useEtatsParcoursEtudiants', () => ({
  useEtatsParcoursEtudiants: () => ({ etats }),
}))
vi.mock('../../layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({
    profile: { id: 'admin-1', role: 'admin_etablissement' },
    session: { access_token: 'jeton-test' },
    notifications: [],
    notificationsNonLues: 0,
    marquerNotificationLue: vi.fn(),
  }),
}))

const { HeuresAdmin } = await import('../HeuresAdmin')

describe('HeuresAdmin — forfait en cours et jalons', () => {
  it('affiche « Xh / Yh » une fois le forfait en cours connu', () => {
    lignesEtudiants = [{ profile: bernard, heures: 2 }]
    etats = { 'eleve-1': { forfaitEpuise: false, sansCoursPlanifie: false, forfait: 32, consommees: 2 } }
    render(
      <MemoryRouter>
        <HeuresAdmin />
      </MemoryRouter>,
    )
    // La ligne de bernard, pas la tuile « Heures suivies » du haut qui affiche aussi « 2h » (même
    // cumul, un seul élève) : on part de son nom pour ne lire que SA ligne.
    const ligne = screen.getByText('bernard bensas').closest('div.row-hl')
    expect(ligne).toBeTruthy()
    expect(ligne!.textContent).toContain('2h')
    expect(ligne!.textContent).toContain('/ 32h')
  })

  it('retombe sur « Xh suivies » tant qu’aucun forfait n’est connu', () => {
    lignesEtudiants = [{ profile: bernard, heures: 0 }]
    etats = { 'eleve-1': { forfaitEpuise: false, sansCoursPlanifie: true, forfait: null, consommees: 0 } }
    render(
      <MemoryRouter>
        <HeuresAdmin />
      </MemoryRouter>,
    )
    expect(screen.getByText('0h suivies')).toBeTruthy()
  })

  it('n’avertit pas en deçà de la moitié du forfait', () => {
    lignesEtudiants = [{ profile: bernard, heures: 2 }]
    etats = { 'eleve-1': { forfaitEpuise: false, sansCoursPlanifie: false, forfait: 32, consommees: 2 } }
    render(
      <MemoryRouter>
        <HeuresAdmin />
      </MemoryRouter>,
    )
    expect(screen.queryByTitle(/Mi-parcours/)).toBeNull()
  })

  it('avertit en rouge à la moitié du forfait en cours', () => {
    lignesEtudiants = [{ profile: bernard, heures: 16 }]
    etats = { 'eleve-1': { forfaitEpuise: false, sansCoursPlanifie: false, forfait: 32, consommees: 16 } }
    render(
      <MemoryRouter>
        <HeuresAdmin />
      </MemoryRouter>,
    )
    expect(screen.getByTitle(/Mi-parcours/)).toBeTruthy()
  })

  it('avertit à 3 heures de la fin du forfait en cours', () => {
    lignesEtudiants = [{ profile: bernard, heures: 30 }]
    etats = { 'eleve-1': { forfaitEpuise: false, sansCoursPlanifie: false, forfait: 32, consommees: 30 } }
    render(
      <MemoryRouter>
        <HeuresAdmin />
      </MemoryRouter>,
    )
    expect(screen.getByTitle(/Fin de parcours/)).toBeTruthy()
  })

  it('garde un seul avertissement par élève, même si les deux jalons sont franchis', () => {
    lignesEtudiants = [{ profile: bernard, heures: 2 }, { profile: lalaina, heures: 2 }]
    etats = {
      'eleve-1': { forfaitEpuise: true, sansCoursPlanifie: false, forfait: 2, consommees: 2 },
      'eleve-2': { forfaitEpuise: false, sansCoursPlanifie: false, forfait: 32, consommees: 1 },
    }
    render(
      <MemoryRouter>
        <HeuresAdmin />
      </MemoryRouter>,
    )
    // bernard (forfait de 2h entièrement consommé) franchit les deux jalons d'un coup : une
    // seule pastille d'avertissement, pas deux.
    expect(screen.getAllByText('!')).toHaveLength(1)
  })
})
