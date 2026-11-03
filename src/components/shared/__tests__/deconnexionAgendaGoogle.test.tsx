import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* « Mets le bouton de déconnexion uniquement du côté admin » — client, 2026-11-04.
   Un professeur voyait un bouton « Déconnecter » qui ne menait, pour lui, qu'à un refus : la
   déconnexion exigeait de toute façon une validation de l'administration (0112). Elle se fait
   désormais depuis Paramètres › Agendas Google des professeurs, côté admin uniquement.
   L'admin, lui, garde le bouton pour SON propre compte dans « Mon profil ». */

const contexte = vi.hoisted(() => ({ role: 'professeur' as 'professeur' | 'admin_etablissement' }))

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({
    session: { access_token: 'jeton-test' },
    profile: { role: contexte.role, email: 'personne@test.fr' },
    platformAdmin: false,
  }),
}))

vi.mock('../../../hooks/useGoogleCalendarPersonnel', () => ({
  // Un compte connecté et pleinement fonctionnel : le seul état où « Déconnecter » s'affichait.
  useStatutGoogleCalendarPersonnel: () => ({
    statut: { google_email: 'personne@gmail.com', connecte_le: '2026-10-01T08:00:00Z', derniere_erreur: null },
    peutEcrire: true,
    loading: false,
    recharger: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useDemandeAgendaGoogle', () => ({
  useDemandeAgendaGoogle: () => ({ demande: null, derniereRefusee: null, recharger: vi.fn() }),
}))

vi.mock('../../../hooks/useRepriseReunionsGoogle', () => ({
  useRepriseReunionsGoogle: () => ({ etat: null, reprendre: vi.fn() }),
}))

const { IntegrationGoogleCalendarPersonnel } = await import('../IntegrationGoogleCalendarPersonnel')

beforeEach(() => {
  contexte.role = 'professeur'
})

describe('Déconnexion de l’agenda Google — réservée à l’administration', () => {
  it('n’offre aucun bouton « Déconnecter » à un professeur', () => {
    render(<IntegrationGoogleCalendarPersonnel />)
    expect(screen.queryByRole('button', { name: 'Déconnecter' })).not.toBeInTheDocument()
  })

  it('laisse l’admin déconnecter son propre compte', () => {
    contexte.role = 'admin_etablissement'
    render(<IntegrationGoogleCalendarPersonnel />)
    expect(screen.getByRole('button', { name: 'Déconnecter' })).toBeInTheDocument()
  })

  it('garde la reconnexion accessible au professeur : c’est sa seule façon de réparer', () => {
    render(<IntegrationGoogleCalendarPersonnel />)
    // Le compte étant en ordre, le bouton est présent mais grisé — jamais absent.
    expect(screen.getByRole('button', { name: /Reconnecter mon agenda/ })).toBeInTheDocument()
  })
})
