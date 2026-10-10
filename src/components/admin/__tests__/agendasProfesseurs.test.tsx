import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* L'écran de suivi des agendas Google des professeurs (0107) existe pour répondre à une question
   précise de l'admin : « qui dois-je relancer ? ». Ces tests fixent les deux comportements dont
   dépend cette réponse — le classement, qui remonte les comptes à régler en tête, et la
   distinction entre un compte absent, un compte en lecture seule et un compte synchronisé. Un
   compte en lecture seule est le cas le plus traître : il a l'air connecté, mais les cours de ce
   professeur continuent de partir du compte de l'établissement. */

const lignes = vi.hoisted(() => ({ valeur: [] as unknown[], demandes: [] as unknown[] }))

/* Deux tables distinctes sont lues par cet écran depuis 0112 — l'état des agendas et les demandes
   de changement d'adresse — et la seconde est interrogée avec `.order()`. Le mock doit donc être
   CHAÎNABLE : un `select` qui renvoyait directement la promesse faisait échouer la lecture des
   demandes, erreur silencieusement absorbée par useCacheRequete, et le test passait en croyant
   tester une liste vide. */
vi.mock('../../../lib/supabaseClient', () => {
  const resultat = (data: unknown[]) => {
    const promesse = Promise.resolve({ data })
    return Object.assign(promesse, {
      order: () => resultat(data),
      eq: () => resultat(data),
      in: () => resultat(data),
      limit: () => resultat(data),
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null }),
    })
  }
  return {
    supabase: {
      from: (table: string) => ({
        select: () => resultat(table === 'demandes_agenda_google_admin' ? lignes.demandes : lignes.valeur),
      }),
    },
  }
})

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ profile: { id: 'admin-1', role: 'admin_etablissement' }, session: { access_token: 'jeton' } }),
}))

const { AgendasProfesseursAdmin } = await import('../AgendasProfesseursAdmin')

const SCOPE_ECRITURE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'
const SCOPE_LECTURE = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email'

beforeEach(() => {
  lignes.valeur = []
  lignes.demandes = []
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

  /* Demandes de changement d'adresse Gmail (0112) : « la validation sera faite uniquement par
     l'admin ». Cet écran est le seul endroit où elles se tranchent — si elles n'y apparaissent
     pas, le professeur attend une réponse que personne ne sait devoir donner. */
  describe('demandes de changement de compte Google', () => {
    const demande = {
      id: 'd-1',
      profile_id: '1',
      prenom: 'Ana',
      nom: 'Rivot',
      email: 'ana@test.fr',
      google_email_actuel: 'ana@gmail.com',
      google_email_souhaite: 'ana.rivot@gmail.com',
      motif: 'Je n’ai plus accès à mon ancienne adresse',
      statut: 'en_attente',
      motif_refus: null,
      decide_le: null,
      created_at: '2026-10-10T08:00:00Z',
    }

    it('présente une demande en attente avec ses deux décisions', async () => {
      lignes.demandes = [demande]

      render(<AgendasProfesseursAdmin />)

      expect(await screen.findByText(/Un professeur demande à changer le compte Google/)).toBeTruthy()
      expect(screen.getByText('ana.rivot@gmail.com')).toBeTruthy()
      expect(screen.getByText(/Je n’ai plus accès à mon ancienne adresse/)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Autoriser ce changement' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Refuser' })).toBeTruthy()
    })

    it('ne montre rien quand une demande est déjà tranchée', async () => {
      /* La vue renvoie l'historique complet ; seules les demandes « en_attente » appellent une
         décision. Une demande approuvée qui resterait affichée inviterait l'admin à trancher deux
         fois le même changement. */
      lignes.demandes = [{ ...demande, statut: 'approuvee', decide_le: '2026-10-10T09:00:00Z' }]

      render(<AgendasProfesseursAdmin />)

      expect(await screen.findByText(/Un professeur est libre de sa première connexion/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Autoriser ce changement' })).toBeNull()
    })

    it('compte les demandes au pluriel', async () => {
      lignes.demandes = [demande, { ...demande, id: 'd-2', profile_id: '2', prenom: 'Bo', nom: 'Tahiry' }]

      render(<AgendasProfesseursAdmin />)

      expect(await screen.findByText(/2 professeurs demandent à changer le compte Google/)).toBeTruthy()
    })
  })
})
