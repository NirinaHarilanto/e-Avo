import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

/* Demande client du 2026-10-20, deux captures côte à côte : un cours corporate et un chat & chill
   occupaient bien un créneau dans l'agenda du professeur (« Mon agenda »), mais la même semaine
   vue depuis « Séances & visio » côté admin ne les montrait nulle part — « pourquoi les deux
   agendas ne sont pas synchronisés ». La page admin ne chargeait tout simplement pas les
   prestations hors cursus.

   Ces tests fixent les trois points qui font la synchronisation : elles apparaissent, elles
   suivent le filtre par professeur de la colonne de gauche, et le clic ouvre leur propre fiche
   (pas celle d'une séance, qu'une prestation n'est pas — ni élève, ni émargement, ni visio). */

const prestation = {
  id: 'prestation-1',
  etablissement_id: 'etab-1',
  teacher_id: 'prof-1',
  type: 'corporate' as const,
  client: 'Telma colleagues',
  debut: new Date().toISOString(),
  duree_minutes: 120,
  lieu: null,
  notes: null,
  statut: 'terminee' as const,
  terminee_le: new Date().toISOString(),
  terminee_par: 'prof-1',
  motif_annulation: null,
  compte_rendu: null,
  compte_rendu_le: null,
  cree_par: 'admin-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

vi.mock('../../../hooks/useSeancesAdmin', () => ({
  useSeancesAdmin: () => ({ seances: [], loading: false, erreur: null, recharger: vi.fn() }),
}))
vi.mock('../../../hooks/useProfesseurs', () => ({
  useProfesseurs: () => ({ professeurs: [{ id: 'prof-1', prenom: 'Nirina Stéphane', nom: 'RAKOTONJANAHARY', etablissement_id: 'etab-1' }] }),
}))
vi.mock('../../../hooks/useEtudiants', () => ({
  useEtudiants: () => ({ etudiants: [{ id: 'eleve-1', prenom: 'Miary', nom: 'Andrianina' }] }),
}))
vi.mock('../../../hooks/useRendezVous', () => ({
  useRendezVous: () => ({ rendezVous: [], loading: false, erreur: null, recharger: vi.fn() }),
}))
vi.mock('../../../hooks/useEvenementsAdmin', () => ({
  useEvenementsAdmin: () => ({ evenements: [], loading: false, recharger: vi.fn() }),
}))
vi.mock('../../../hooks/usePrestationsExternes', () => ({
  usePrestationsExternesEtablissement: () => ({ prestations: [prestation], loading: false, erreur: null, recharger: vi.fn() }),
  usePrestationsExternes: () => ({ prestations: [prestation], loading: false, erreur: null, recharger: vi.fn() }),
}))
vi.mock('../../../hooks/useGoogleCalendarPersonnel', () => ({
  useEvenementsGoogleCalendarPersonnel: () => ({ evenements: [], parId: new Map(), recharger: vi.fn() }),
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
vi.mock('../../layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

/* Même stub de grille que seancesAdminGoogle.test.tsx : ce qu'on teste est la composition de la
   liste d'événements et le routage du clic, pas le positionnement dans la grille. */
vi.mock('../../../components/ui/AgendaHebdo', () => ({
  AgendaHebdo: ({ evenements, onSelectionner }: { evenements: { id: string; titre: string }[]; onSelectionner?: (e: { id: string }) => void }) => (
    <div>
      {evenements.map((e) => (
        <button key={e.id} onClick={() => onSelectionner?.(e)}>
          {e.titre}
        </button>
      ))}
    </div>
  ),
}))

const { SeancesAdmin } = await import('../SeancesAdmin')

describe('SeancesAdmin — prestations corporate / chat & chill', () => {
  it('montre la prestation dans l’agenda admin, sans rien cocher', () => {
    render(
      <MemoryRouter>
        <SeancesAdmin />
      </MemoryRouter>,
    )
    expect(screen.getByText('Telma colleagues')).toBeTruthy()
  })

  it('la garde quand son professeur est coché', () => {
    render(
      <MemoryRouter>
        <SeancesAdmin />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByLabelText(/Nirina Stéphane/))
    expect(screen.getByText('Telma colleagues')).toBeTruthy()
  })

  it('la retire quand seul un élève est coché : une prestation hors cursus n’a aucun élève', () => {
    render(
      <MemoryRouter>
        <SeancesAdmin />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByLabelText(/Miary/))
    expect(screen.queryByText('Telma colleagues')).toBeNull()
  })

  it('ouvre la fiche de la prestation au clic, pas celle d’une séance', () => {
    render(
      <MemoryRouter>
        <SeancesAdmin />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Telma colleagues'))
    expect(screen.getByText('Prestation hors cursus')).toBeTruthy()
    // La fiche nomme le client et le type, comme côté professeur.
    expect(screen.getByText('Corporate')).toBeTruthy()
  })
})
