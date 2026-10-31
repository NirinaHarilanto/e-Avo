import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

/* « Séances & visio », cases des PROFESSEURS — demande client du 2026-10-31 : « les agendas ne
   sont toujours pas synchronisés, regarde pour oelimanda ». Cocher un professeur n'affichait que
   ses séances HOC, alors que son propre espace superpose aussi ses indisponibilités Google
   (0098) : l'admin posait donc des cours sur des créneaux déjà pris. Ces tests fixent que
   l'agenda Google du professeur coché apparaît ici, qu'il disparaît avec la case, et que le clic
   ouvre sa fiche — en lecture seule, l'agenda appartenant au professeur. */

const PROFESSEUR = { id: 'prof-1', prenom: 'Oelimanda', nom: 'RANAIVO ANDRIANJAFITOANINA', role: 'professeur' }

vi.mock('../../../hooks/useSeancesAdmin', () => ({
  useSeancesAdmin: () => ({ seances: [], loading: false, erreur: null, recharger: vi.fn() }),
}))
vi.mock('../../../hooks/useProfesseurs', () => ({ useProfesseurs: () => ({ professeurs: [PROFESSEUR] }) }))
vi.mock('../../../hooks/useEtudiants', () => ({ useEtudiants: () => ({ etudiants: [] }) }))
vi.mock('../../../hooks/useRendezVous', () => ({
  useRendezVous: () => ({ rendezVous: [], loading: false, erreur: null, recharger: vi.fn() }),
}))
vi.mock('../../../hooks/useEvenementsAdmin', () => ({
  useEvenementsAdmin: () => ({ evenements: [], loading: false, recharger: vi.fn() }),
}))
vi.mock('../../../hooks/usePrestationsExternes', () => ({
  usePrestationsExternesEtablissement: () => ({ prestations: [], recharger: vi.fn() }),
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

const evenementGoogle = {
  id: 'evt-gcal-prof',
  titre: 'Unavailable',
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
  /* L'agenda est celui du professeur : l'admin le consulte, il ne le modifie pas. */
  modifiable: false,
  proprietaire: 'Oelimanda RANAIVO ANDRIANJAFITOANINA',
}

vi.mock('../../../hooks/useGoogleCalendarPersonnel', () => ({
  useEvenementsGoogleCalendarPersonnel: () => ({ evenements: [], parId: new Map(), recharger: vi.fn() }),
  /* Reproduit le contrat réel du hook : il ne rend les événements d'un professeur que si son
     identifiant lui est passé — c'est la sélection de l'écran qui commande. */
  useEvenementsGoogleProfesseurs: (_semaineDebut: Date, professeurIds: string[]) => ({
    evenements: professeurIds.includes(PROFESSEUR.id)
      ? [
          {
            id: `gcal:${evenementGoogle.id}`,
            debut: evenementGoogle.debut,
            dureeMinutes: 30,
            titre: evenementGoogle.titre,
            sousTitre: `Agenda Google · ${evenementGoogle.proprietaire}`,
            ton: 'neutre',
          },
        ]
      : [],
    parId: new Map([[evenementGoogle.id, evenementGoogle]]),
    recharger: vi.fn(),
  }),
}))

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

function afficher() {
  render(
    <MemoryRouter>
      <SeancesAdmin />
    </MemoryRouter>,
  )
}

describe('SeancesAdmin — agenda Google du professeur coché', () => {
  it('n’affiche pas l’agenda Google du professeur tant que sa case n’est pas cochée', () => {
    afficher()
    expect(screen.queryByText('Unavailable')).toBeNull()
  })

  it('affiche l’indisponibilité Google du professeur une fois sa case cochée', () => {
    afficher()
    fireEvent.click(screen.getByLabelText(/Oelimanda/))
    expect(screen.getByText('Unavailable')).toBeTruthy()
  })

  it('la retire quand on décoche le professeur', () => {
    afficher()
    const case_ = screen.getByLabelText(/Oelimanda/)
    fireEvent.click(case_)
    expect(screen.getByText('Unavailable')).toBeTruthy()
    fireEvent.click(case_)
    expect(screen.queryByText('Unavailable')).toBeNull()
  })

  it('ouvre la fiche Google au clic sur l’événement', () => {
    afficher()
    fireEvent.click(screen.getByLabelText(/Oelimanda/))
    fireEvent.click(screen.getByText('Unavailable'))
    // La fiche reprend le titre dans sa propre pop-up : il apparaît donc deux fois.
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(1)
  })
})
