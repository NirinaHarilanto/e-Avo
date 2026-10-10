import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Blocage de la validation quand le numéro saisi existe déjà — demande client du 2026-10-10 :
   « bloquer la validation de la facture si le numéro [...] existe déjà ». La vérification doit
   empêcher l'INSERT de partir, pas seulement traduire l'erreur Postgres après coup. */

const etat = vi.hoisted(() => ({
  numeroExistant: null as string | null,
  insert: vi.fn(async (_ligne: unknown) => ({ error: null as { code: string; message: string } | null })),
}))

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'invoices') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: etat.numeroExistant ? { id: 'autre' } : null }) }),
            }),
          }),
          insert: (ligne: unknown) => etat.insert(ligne),
        }
      }
      throw new Error(`table inattendue dans ce test : ${table}`)
    },
  },
}))

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ profile: { id: 'admin-1', etablissement_id: 'etab-1' } }),
}))

vi.mock('../../../hooks/useEtudiants', () => ({
  useEtudiants: () => ({ etudiants: [{ id: 'etu-1', prenom: 'Ana', nom: 'Rivot' }] }),
}))
vi.mock('../../../hooks/useProfesseurs', () => ({
  useProfesseurs: () => ({ professeurs: [] }),
}))

const { CreerFacture } = await import('../CreerFacture')

beforeEach(() => {
  etat.numeroExistant = null
  etat.insert.mockClear()
})

function remplirEtSoumettre(numero: string) {
  // Un seul <select> dans ce formulaire tant qu'aucun devis accepté n'est proposé : celui de
  // l'étudiant destinataire.
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'etu-1' } })
  fireEvent.change(screen.getByPlaceholderText('FAC-2026-001'), { target: { value: numero } })
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la facture' }))
}

describe('CreerFacture — unicité du numéro avant validation', () => {
  it('bloque la création et n’insère rien quand le numéro existe déjà', async () => {
    etat.numeroExistant = 'FAC-2026-0001'
    render(<CreerFacture etablissementId="etab-1" devisAcceptes={[]} onCree={() => {}} onAnnuler={() => {}} />)

    remplirEtSoumettre('FAC-2026-0001')

    expect(await screen.findByText(/déjà utilisé par un autre document/)).toBeTruthy()
    expect(etat.insert).not.toHaveBeenCalled()
  })

  it('laisse passer et insère quand le numéro est libre', async () => {
    etat.numeroExistant = null
    const onCree = vi.fn()
    render(<CreerFacture etablissementId="etab-1" devisAcceptes={[]} onCree={onCree} onAnnuler={() => {}} />)

    remplirEtSoumettre('FAC-2026-0002')

    await waitFor(() => expect(etat.insert).toHaveBeenCalledTimes(1))
    expect(onCree).toHaveBeenCalled()
  })
})
