import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* « Reconnecter mon agenda » grisé quand tout fonctionne déjà — demande client du 2026-10-10 :
   rien ne justifie de relancer l'écran de consentement Google quand la synchronisation est déjà en
   ordre, et chaque passage par cet écran avec un compte différent coûte une place définitive du
   quota Google tant que l'application n'a pas sa validation officielle. Réactivé à la déconnexion.

   Le cas à ne JAMAIS casser : le bouton doit rester actif en lecture seule ou en incident, sinon la
   seule façon de réparer une synchronisation cassée disparaît — se déconnecter d'abord est refusé à
   un professeur sans l'accord de l'administration (0112), donc « reconnecter la même adresse »
   DOIT rester accessible dans ces deux états précis. */

const statutMock = vi.hoisted(() => ({
  valeur: { statut: null as null | Record<string, unknown>, peutEcrire: true },
}))

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({
    session: { access_token: 'jeton-test' },
    profile: { role: 'professeur', email: 'prof@test.fr' },
    platformAdmin: false,
  }),
}))

vi.mock('../../../hooks/useGoogleCalendarPersonnel', () => ({
  useStatutGoogleCalendarPersonnel: () => ({
    statut: statutMock.valeur.statut,
    peutEcrire: statutMock.valeur.peutEcrire,
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
  statutMock.valeur = { statut: null, peutEcrire: true }
})

describe('IntegrationGoogleCalendarPersonnel — bouton de reconnexion', () => {
  it('reste actif « Connecter mon agenda Google » quand rien n’est connecté', () => {
    render(<IntegrationGoogleCalendarPersonnel />)
    const bouton = screen.getByRole('button', { name: 'Connecter mon agenda Google' })
    expect(bouton).toHaveProperty('disabled', false)
  })

  it('grise « Reconnecter mon agenda » quand la synchronisation est pleinement en ordre', () => {
    statutMock.valeur = {
      statut: { google_email: 'prof@gmail.com', connecte_le: '2026-10-10T10:00:00Z', derniere_erreur: null },
      peutEcrire: true,
    }
    render(<IntegrationGoogleCalendarPersonnel />)
    const bouton = screen.getByRole('button', { name: 'Reconnecter mon agenda' })
    expect(bouton).toHaveProperty('disabled', true)
  })

  it('garde « Reconnecter mon agenda » actif en lecture seule — seul chemin de réparation sans accord admin', () => {
    statutMock.valeur = {
      statut: { google_email: 'prof@gmail.com', connecte_le: '2026-10-10T10:00:00Z', derniere_erreur: null },
      peutEcrire: false,
    }
    render(<IntegrationGoogleCalendarPersonnel />)
    const bouton = screen.getByRole('button', { name: 'Reconnecter mon agenda' })
    expect(bouton).toHaveProperty('disabled', false)
  })

  it('garde « Reconnecter mon agenda » actif après un incident Google signalé', () => {
    statutMock.valeur = {
      statut: { google_email: 'prof@gmail.com', connecte_le: '2026-10-10T10:00:00Z', derniere_erreur: 'Jeton révoqué.' },
      peutEcrire: true,
    }
    render(<IntegrationGoogleCalendarPersonnel />)
    const bouton = screen.getByRole('button', { name: 'Reconnecter mon agenda' })
    expect(bouton).toHaveProperty('disabled', false)
  })
})
