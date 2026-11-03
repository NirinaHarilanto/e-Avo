import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Désynchronisation du Google Calendar d'un professeur par l'administration — demande client du
   2026-11-04. En deux temps volontairement : le geste change l'expéditeur des invitations que
   reçoivent les élèves du professeur (ses prochaines réunions repartent du compte de
   l'établissement), ce qui ne doit pas tenir à un clic de travers. */

const appels = vi.hoisted(() => ({ fetch: [] as { url: string; corps: unknown }[], reponse: { ok: true } as { ok: boolean; error?: string } }))

vi.mock('../../../lib/jetonAcces', () => ({ jetonAcces: async () => 'jeton-test' }))

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { access_token: 'jeton-test' }, profile: { role: 'admin_etablissement' } }),
}))

const { BoutonDeconnecterAgenda } = await import('../AgendasProfesseursAdmin')

const ligne = {
  profile_id: 'prof-1',
  prenom: 'Harinjo',
  nom: 'ANDRIAMAHENINA',
  google_email: 'harinjo@gmail.com',
  connecte_le: '2026-10-01T08:00:00Z',
  derniere_erreur: null,
} as never

beforeEach(() => {
  appels.fetch = []
  appels.reponse = { ok: true }
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    appels.fetch.push({ url, corps: JSON.parse(String(options.body)) })
    return {
      ok: appels.reponse.ok,
      json: async () => (appels.reponse.ok ? { ok: true } : { error: appels.reponse.error }),
    } as Response
  })
})

describe('BoutonDeconnecterAgenda', () => {
  it('n’appelle rien au premier clic : il demande confirmation', async () => {
    render(<BoutonDeconnecterAgenda ligne={ligne} onDeconnecte={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter' }))

    expect(screen.getByText(/Délier harinjo@gmail.com/)).toBeInTheDocument()
    expect(appels.fetch).toHaveLength(0)
  })

  it('déconnecte le bon professeur une fois confirmé', async () => {
    const onDeconnecte = vi.fn()
    render(<BoutonDeconnecterAgenda ligne={ligne} onDeconnecte={onDeconnecte} />)
    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))

    await waitFor(() => expect(appels.fetch).toHaveLength(1))
    expect(appels.fetch[0].url).toBe('/api/admin/deconnecter-agenda-professeur')
    expect(appels.fetch[0].corps).toEqual({ profileId: 'prof-1' })
    await waitFor(() => expect(onDeconnecte).toHaveBeenCalled())
  })

  it('renonce sans rien appeler si on annule', () => {
    render(<BoutonDeconnecterAgenda ligne={ligne} onDeconnecte={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.getByRole('button', { name: 'Déconnecter' })).toBeInTheDocument()
    expect(appels.fetch).toHaveLength(0)
  })

  it('affiche l’erreur du serveur sans prétendre avoir réussi', async () => {
    appels.reponse = { ok: false, error: 'Ce professeur n’a aucun agenda Google connecté.' }
    const onDeconnecte = vi.fn()
    render(<BoutonDeconnecterAgenda ligne={ligne} onDeconnecte={onDeconnecte} />)
    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))

    await waitFor(() => expect(screen.getByText(/aucun agenda Google connecté/)).toBeInTheDocument())
    expect(onDeconnecte).not.toHaveBeenCalled()
  })
})
