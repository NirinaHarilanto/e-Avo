import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Édition en ligne du numéro d'un DEVIS — capacité nouvelle le 2026-10-10 (les factures et reçus
   l'avaient depuis le 2026-10-05, les devis non). Même exigence que partout ailleurs sur ce
   chantier : vérifier l'unicité AVANT d'enregistrer et bloquer si le numéro existe déjà, pas
   seulement traduire l'erreur Postgres après coup. */

const etat = vi.hoisted(() => ({
  numeroExistant: null as string | null,
  update: vi.fn(async (_valeurs: unknown) => ({ error: null as { code: string; message: string } | null })),
}))

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'quotes') throw new Error(`table inattendue dans ce test : ${table}`)
      const finale = { maybeSingle: async () => ({ data: etat.numeroExistant ? { id: 'autre' } : null }) }
      return {
        select: () => ({
          // .eq('etablissement_id', …).eq('numero', …) PUIS, pour cette ligne précise,
          // .neq('id', …) — même chaîne finale quel que soit le chemin emprunté.
          eq: () => ({ eq: () => ({ ...finale, neq: () => finale }) }),
        }),
        update: (valeurs: unknown) => ({ eq: () => etat.update(valeurs as never) }),
      }
    },
  },
}))

const { LigneDevis } = await import('../FacturationAdmin')

const item = {
  devis: {
    id: 'devis-1',
    etablissement_id: 'etab-1',
    numero: 'DEV-2026-0001',
    statut: 'brouillon',
    objet: 'Formule intensive',
    montant_ttc: 500,
  },
  etudiant: { id: 'etu-1', prenom: 'Ana', nom: 'Rivot' },
} as unknown as Parameters<typeof LigneDevis>[0]['item']

beforeEach(() => {
  etat.numeroExistant = null
  etat.update.mockClear()
})

describe('LigneDevis — unicité du numéro avant validation', () => {
  it('bloque et n’enregistre rien quand le numéro saisi existe déjà', async () => {
    etat.numeroExistant = 'DEV-2026-0099'
    render(<LigneDevis item={item} onImprimer={() => {}} onChange={() => {}} accessToken="jeton" />)

    // Le bouton affiche le numéro lui-même comme texte visible (son nom accessible) ; le titre
    // n'est consulté par les lecteurs d'écran qu'en l'absence de texte.
    fireEvent.click(screen.getByRole('button', { name: 'DEV-2026-0001' }))
    const champ = screen.getByDisplayValue('DEV-2026-0001')
    fireEvent.change(champ, { target: { value: 'DEV-2026-0099' } })
    fireEvent.blur(champ)

    expect(await screen.findByText(/déjà utilisé par un autre document/)).toBeTruthy()
    expect(etat.update).not.toHaveBeenCalled()
  })

  it('enregistre quand le numéro est libre', async () => {
    etat.numeroExistant = null
    const onChange = vi.fn()
    render(<LigneDevis item={item} onImprimer={() => {}} onChange={onChange} accessToken="jeton" />)

    fireEvent.click(screen.getByRole('button', { name: 'DEV-2026-0001' }))
    const champ = screen.getByDisplayValue('DEV-2026-0001')
    fireEvent.change(champ, { target: { value: 'DEV-2026-0002' } })
    fireEvent.blur(champ)

    await waitFor(() => expect(etat.update).toHaveBeenCalledWith({ numero: 'DEV-2026-0002' }))
    expect(onChange).toHaveBeenCalled()
  })
})
