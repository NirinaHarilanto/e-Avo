import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelecteurEtablissement } from '../SelecteurEtablissement'

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [
              {
                id: '1',
                nom: 'Institut Lingua Nova',
                slug: 'lingua-nova',
                specialite: 'Langues vivantes',
                couleur_accent: '#FF7A1A',
                logo_url: null,
                created_at: '',
              },
            ],
            error: null,
          }),
      }),
    }),
  },
}))

describe('SelecteurEtablissement', () => {
  it("affiche les établissements renvoyés par Supabase", async () => {
    render(<SelecteurEtablissement />)
    expect(await screen.findByText('Institut Lingua Nova')).toBeInTheDocument()
  })
})
