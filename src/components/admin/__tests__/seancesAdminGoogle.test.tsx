import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/* « Séances & visio », case « Admin » — demande client du 2026-10-10 : « quand la box admin est
   coché, [l'agenda] devrait être synchronisé exactement avec l'agenda de l'admin dans la section
   Agenda ». Avant ce correctif, cocher « Admin » ici n'ajoutait que les rendez-vous prospects et
   les événements admin — jamais la superposition de l'agenda Google personnel de l'admin, que la
   page « Agenda » (RendezVousAdmin.tsx) affiche pourtant depuis le 2026-10-09. Ces tests fixent
   que l'événement Google apparaît désormais ici aussi, et que le clic dessus ouvre sa propre
   fiche plutôt que de rester muet ou d'ouvrir la mauvaise pop-up. */

vi.mock('../../../hooks/useSeancesAdmin', () => ({
  useSeancesAdmin: () => ({ seances: [], loading: false, erreur: null, recharger: vi.fn() }),
}))
vi.mock('../../../hooks/useProfesseurs', () => ({ useProfesseurs: () => ({ professeurs: [] }) }))
vi.mock('../../../hooks/useEtudiants', () => ({ useEtudiants: () => ({ etudiants: [] }) }))
vi.mock('../../../hooks/useRendezVous', () => ({
  useRendezVous: () => ({ rendezVous: [], loading: false, erreur: null, recharger: vi.fn() }),
}))
vi.mock('../../../hooks/useEvenementsAdmin', () => ({
  useEvenementsAdmin: () => ({ evenements: [], loading: false, recharger: vi.fn() }),
}))
vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ profile: { id: 'admin-1', role: 'admin_etablissement' }, session: { access_token: 'jeton-test' } }),
}))

/* Le chrome de layout (barre latérale, navigation — EspaceLayout) exige un <Router> et n'a aucun
   rapport avec ce qu'on teste ici ; un passe-plat l'isole, comme les autres dépendances lourdes
   mockées plus haut. */
vi.mock('../../layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const evenementGoogle = {
  id: 'evt-gcal-1',
  titre: 'Réunion équipe',
  debut: new Date().toISOString(),
  fin: new Date(Date.now() + 30 * 60_000).toISOString(),
  description: null,
  lieu: null,
  invites: [],
  organisateur: null,
  rappels: [],
  recurrence: null,
  couleur: null,
  lienGoogle: null,
  recurrent: false,
  serieId: null,
  modifiable: true,
}

vi.mock('../../../hooks/useGoogleCalendarPersonnel', () => ({
  useEvenementsGoogleCalendarPersonnel: () => ({
    evenements: [{ id: `gcal:${evenementGoogle.id}`, debut: evenementGoogle.debut, dureeMinutes: 30, titre: evenementGoogle.titre, sousTitre: 'Agenda Google', ton: 'neutre' }],
    parId: new Map([[evenementGoogle.id, evenementGoogle]]),
    recharger: vi.fn(),
  }),
}))

/* La grille elle-même (positionnement, défilement...) n'est pas ce qu'on teste ici : un stub qui
   rend chaque événement comme un bouton cliquable isole exactement ce qui change — la composition
   de la liste `evenements` et le routage du clic vers la bonne fiche. */
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

describe('SeancesAdmin — superposition Google quand « Admin » est coché', () => {
  it('ne montre pas l’événement Google tant que « Admin » n’est pas coché', () => {
    render(<SeancesAdmin />)
    expect(screen.queryByText('Réunion équipe')).toBeNull()
  })

  it('affiche l’événement Google une fois « Admin » coché', () => {
    render(<SeancesAdmin />)
    fireEvent.click(screen.getByLabelText(/Admin/))
    expect(screen.getByText('Réunion équipe')).toBeTruthy()
  })

  it('ouvre la fiche Google au clic, pas la pop-up des rendez-vous admin', () => {
    render(<SeancesAdmin />)
    fireEvent.click(screen.getByLabelText(/Admin/))
    fireEvent.click(screen.getByText('Réunion équipe'))

    // La fiche Google affiche le titre en en-tête de sa propre pop-up.
    expect(screen.getAllByText('Réunion équipe').length).toBeGreaterThan(1)
  })
})
