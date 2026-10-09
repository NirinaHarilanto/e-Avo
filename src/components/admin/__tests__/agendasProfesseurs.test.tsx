import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* L'écran de suivi des agendas Google des professeurs (0107) existe pour répondre à une question
   précise de l'admin : « qui dois-je relancer ? ». Ces tests fixent les deux comportements dont
   dépend cette réponse — le classement, qui remonte les comptes à régler en tête, et la
   distinction entre un compte absent, un compte en lecture seule et un compte synchronisé. Un
   compte en lecture seule est le cas le plus traître : il a l'air connecté, mais les cours de ce
   professeur continuent de partir du compte de l'établissement. */

const lignes = vi.hoisted(() => ({ valeur: [] as unknown[] }))

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: lignes.valeur }) }),
  },
}))

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ profile: { id: 'admin-1', role: 'admin_etablissement' } }),
}))

const { AgendasProfesseursAdmin } = await import('../AgendasProfesseursAdmin')

const SCOPE_ECRITURE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'
const SCOPE_LECTURE = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email'

beforeEach(() => {
  lignes.valeur = []
})

describe('AgendasProfesseursAdmin', () => {
  it('distingue synchronisé, lecture seule et non connecté', async () => {
    lignes.valeur = [
      { profile_id: '1', prenom: 'Ana', nom: 'Rivot', email: 'ana@test.fr', google_email: 'ana@gmail.com', connecte_le: '2026-10-09T10:00:00Z', derniere_erreur: null, scope: SCOPE_ECRITURE },
      { profile_id: '2', prenom: 'Bo', nom: 'Tahiry', email: 'bo@test.fr', google_email: 'bo@gmail.com', connecte_le: '2026-10-05T10:00:00Z', derniere_erreur: null, scope: SCOPE_LECTURE },
      { profile_id: '3', prenom: 'Cy', nom: 'Rakoto', email: 'cy@test.fr', google_email: null, connecte_le: null, derniere_erreur: null, scope: null },
    ]

    render(<AgendasProfesseursAdmin />)

    expect(await screen.findByText('Synchronisé')).toBeTruthy()
    expect(screen.getByText('Lecture seule')).toBeTruthy()
    expect(screen.getByText('Non connecté')).toBeTruthy()
  })

  it('remonte en tête les professeurs à relancer', async () => {
    lignes.valeur = [
      { profile_id: '1', prenom: 'Ana', nom: 'Rivot', email: 'ana@test.fr', google_email: 'ana@gmail.com', connecte_le: '2026-10-09T10:00:00Z', derniere_erreur: null, scope: SCOPE_ECRITURE },
      { profile_id: '3', prenom: 'Cy', nom: 'Rakoto', email: 'cy@test.fr', google_email: null, connecte_le: null, derniere_erreur: null, scope: null },
    ]

    render(<AgendasProfesseursAdmin />)

    const noms = (await screen.findAllByText(/Rivot|Rakoto/)).map((n) => n.textContent)
    /* Le compte non connecté passe devant le compte en règle : c'est lui qui demande une action. */
    expect(noms).toEqual(['Cy Rakoto', 'Ana Rivot'])
  })

  it('compte les professeurs à relancer dans un avertissement', async () => {
    lignes.valeur = [
      { profile_id: '2', prenom: 'Bo', nom: 'Tahiry', email: 'bo@test.fr', google_email: 'bo@gmail.com', connecte_le: '2026-10-05T10:00:00Z', derniere_erreur: null, scope: SCOPE_LECTURE },
      { profile_id: '3', prenom: 'Cy', nom: 'Rakoto', email: 'cy@test.fr', google_email: null, connecte_le: null, derniere_erreur: null, scope: null },
    ]

    render(<AgendasProfesseursAdmin />)

    expect(await screen.findByText(/2 professeurs n’ont pas encore d’agenda Google/)).toBeTruthy()
  })

  it('n’avertit de rien quand tous les comptes sont synchronisés', async () => {
    lignes.valeur = [
      { profile_id: '1', prenom: 'Ana', nom: 'Rivot', email: 'ana@test.fr', google_email: 'ana@gmail.com', connecte_le: '2026-10-09T10:00:00Z', derniere_erreur: null, scope: SCOPE_ECRITURE },
    ]

    render(<AgendasProfesseursAdmin />)

    expect(await screen.findByText('Synchronisé')).toBeTruthy()
    expect(screen.queryByText(/n’ont pas encore d’agenda Google/)).toBeNull()
    expect(screen.queryByText(/n’a pas encore d’agenda Google/)).toBeNull()
  })
})
