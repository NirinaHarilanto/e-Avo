import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Suppression à trois visages (règle client du 2026-10-10) — ces tests fixent laquelle des trois
   branches s'applique selon qui regarde le document, et vérifient qu'elles n'empiètent jamais
   l'une sur l'autre :
     1. propriétaire → vraie suppression, avec confirmation listant qui partage la vue ;
     2. destinataire d'un partage REÇU PAR MOI (pas par le sujet de l'espace parcouru, voir le
        commentaire de monPartageId dans le composant) → retire seulement ma ligne de partage ;
     3. ni l'un ni l'autre → comportement préexistant, piloté par `peutSupprimer`, inchangé. */

const etat = vi.hoisted(() => ({
  monPartageId: null as string | null,
  partagesDuDocument: [] as { destinataire_nom: string | null }[],
  deleteAppels: [] as unknown[],
}))

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://x' }, error: null }) }) },
    from: (table: string) => {
      if (table !== 'document_partages') throw new Error(`table inattendue : ${table}`)
      return {
        select: (colonnes: string) => {
          // Lecture ciblée de MON propre partage (monPartageId) : .select('id').eq(...).eq(...).maybeSingle()
          if (colonnes === 'id') {
            return {
              eq: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: etat.monPartageId ? { id: etat.monPartageId } : null } ) }),
              }),
            }
          }
          // Lecture des destinataires avant confirmation de suppression (propriétaire) :
          // .select('destinataire_nom').eq('document_id', ...)
          return { eq: async () => ({ data: etat.partagesDuDocument }) }
        },
        delete: () => ({
          eq: (colonne: string, valeur: string) => {
            etat.deleteAppels.push([colonne, valeur])
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  },
}))

vi.mock('../PartagerDocumentModale', () => ({
  PartagerDocumentModale: () => null,
}))

const profilCourant = vi.hoisted(() => ({ valeur: { id: 'moi', role: 'professeur' } }))

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { access_token: 'jeton-test' }, profile: profilCourant.valeur }),
}))

const { DetailDocumentModale } = await import('../DetailDocumentModale')

const documentDeBase = {
  id: 'doc-1',
  nom_original: 'Support.pdf',
  owner_profile_id: 'proprietaire',
  categorie: 'support_pedagogique',
  categorie_libre: null,
  taille_octets: 1024,
  created_at: '2026-10-10T08:00:00Z',
} as unknown as Parameters<typeof DetailDocumentModale>[0]['document']

beforeEach(() => {
  etat.monPartageId = null
  etat.partagesDuDocument = []
  etat.deleteAppels = []
  profilCourant.valeur = { id: 'moi', role: 'professeur' }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('DetailDocumentModale — suppression', () => {
  it('propriétaire : liste les destinataires actuels avant de confirmer la suppression réelle', async () => {
    etat.partagesDuDocument = [{ destinataire_nom: 'Ana Rivot' }, { destinataire_nom: 'Bo Tahiry' }]
    const document = { ...documentDeBase, owner_profile_id: 'moi' }

    render(<DetailDocumentModale document={document} peutSupprimer={false} peutPartager={false} mention={null} onFermer={() => {}} onChange={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByText(/2 personnes ont actuellement la vue/)).toBeTruthy()
    expect(screen.getByText('Ana Rivot')).toBeTruthy()
    expect(screen.getByText('Bo Tahiry')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/documents/supprimer', expect.objectContaining({ method: 'POST' })))
  })

  it('propriétaire sans aucun partage : le dit, sans bloquer la suppression', async () => {
    const document = { ...documentDeBase, owner_profile_id: 'moi' }
    render(<DetailDocumentModale document={document} peutSupprimer={false} peutPartager={false} mention={null} onFermer={() => {}} onChange={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByText(/Personne d’autre n’a actuellement la vue/)).toBeTruthy()
  })

  it('destinataire d’un partage reçu PAR MOI : « Retirer de mon espace » ne touche que ma ligne, jamais le document', async () => {
    etat.monPartageId = 'partage-42'
    const document = { ...documentDeBase, owner_profile_id: 'quelqu-un-d-autre' }

    render(<DetailDocumentModale document={document} peutSupprimer={false} peutPartager={false} mention={{ par: 'Ana', message: null }} onFermer={() => {}} onChange={() => {}} />)

    const bouton = await screen.findByRole('button', { name: 'Retirer de mon espace' })
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
    fireEvent.click(bouton)

    await waitFor(() => expect(etat.deleteAppels).toEqual([['id', 'partage-42']]))
    // Jamais la route de suppression RÉELLE du document.
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ni propriétaire ni destinataire : retombe sur le comportement existant piloté par peutSupprimer', async () => {
    const document = { ...documentDeBase, owner_profile_id: 'quelqu-un-d-autre' }
    render(<DetailDocumentModale document={document} peutSupprimer={true} peutPartager={false} mention={null} onFermer={() => {}} onChange={() => {}} />)

    const bouton = await screen.findByRole('button', { name: 'Supprimer' })
    fireEvent.click(bouton)

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/documents/supprimer', expect.objectContaining({ method: 'POST' })))
  })

  it('ni propriétaire ni destinataire, et peutSupprimer=false : aucun bouton de suppression', async () => {
    const document = { ...documentDeBase, owner_profile_id: 'quelqu-un-d-autre' }
    render(<DetailDocumentModale document={document} peutSupprimer={false} peutPartager={false} mention={null} onFermer={() => {}} onChange={() => {}} />)

    await screen.findByText('Support.pdf')
    expect(screen.queryByRole('button', { name: /Supprimer|Retirer/ })).toBeNull()
  })
})
