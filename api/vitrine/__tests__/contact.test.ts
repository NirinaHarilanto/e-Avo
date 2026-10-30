import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/* Seul appel à Supabase sur ce chemin : le RPC de limitation de débit, interrogé avant même la
   validation des champs n'a-t-elle pas déjà échoué plus tôt. « autorisé » pour laisser chaque
   test suivre son chemin normal jusqu'à l'envoi (ou son refus) par Resend. */
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => ({ data: true, error: null }),
  }),
}))

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://exemple.test'
  process.env.SUPABASE_SECRET_KEY = 'cle-test'
})

const { default: handler } = await import('../contact.js')

function corpsValide(champs: Record<string, unknown> = {}) {
  return {
    nom: 'Ana Rivot',
    email: 'ana@exemple.test',
    telephone: '0340000000',
    projet: 'Je voudrais des cours particuliers pour mon fils de 12 ans.',
    ...champs,
  }
}

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/vitrine/contact', {
    method: 'POST',
    body: JSON.stringify(corps),
  })
}

describe('api/vitrine/contact', () => {
  it('refuse une autre méthode que POST', async () => {
    const reponse = await handler(new Request('https://exemple.test/api/vitrine/contact', { method: 'GET' }))
    expect(reponse.status).toBe(405)
  })

  it('refuse un nom manquant', async () => {
    const reponse = await handler(requete(corpsValide({ nom: '' })))
    const corps = (await reponse.json()) as { error?: string }
    expect(reponse.status).toBe(400)
    expect(corps.error).toContain('nom')
  })

  it('refuse un projet manquant', async () => {
    const reponse = await handler(requete(corpsValide({ projet: '   ' })))
    expect(reponse.status).toBe(400)
  })

  it('refuse une adresse e-mail invalide', async () => {
    const reponse = await handler(requete(corpsValide({ email: 'pas-une-adresse' })))
    const corps = (await reponse.json()) as { error?: string }
    expect(reponse.status).toBe(400)
    expect(corps.error).toContain('invalide')
  })

  it('accepte un message sans téléphone ni e-mail, les deux étant optionnels', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'email-test' }), { status: 200 })))
    process.env.RESEND_API_KEY = 'cle-resend-test'
    process.env.RESEND_FROM = 'Hari Online Club <contact@harionlineclub.app>'
    const reponse = await handler(requete({ nom: 'Ana', projet: 'Un projet.', telephone: undefined, email: undefined }))
    expect(reponse.status).toBe(200)
  })

  describe('avec Resend configuré', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 'cle-resend-test'
      process.env.RESEND_FROM = 'Hari Online Club <contact@harionlineclub.app>'
    })

    it('envoie le message à l’administration avec le visiteur en reply-to', async () => {
      const appelFetch = vi.fn(async (_url: string, options: { body: string }) => new Response(JSON.stringify({ id: 'email-test' }), { status: 200 }))
      vi.stubGlobal('fetch', appelFetch)

      const reponse = await handler(requete(corpsValide()))
      const corps = (await reponse.json()) as { ok?: boolean }
      expect(reponse.status).toBe(200)
      expect(corps.ok).toBe(true)

      expect(appelFetch).toHaveBeenCalledTimes(1)
      const [, options] = appelFetch.mock.calls[0]
      const envoi = JSON.parse(options.body)
      expect(envoi.to).toEqual(['admin@harionlineclub.com'])
      expect(envoi.reply_to).toBe('ana@exemple.test')
      expect(envoi.subject).toContain('Ana Rivot')
      expect(envoi.html).toContain('Ana Rivot')
    })

    it('répond en erreur explicite si Resend refuse l’envoi, plutôt que de prétendre un succès', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('refus Resend', { status: 422 })))
      const reponse = await handler(requete(corpsValide()))
      const corps = (await reponse.json()) as { error?: string }
      expect(reponse.status).toBe(502)
      expect(corps.error).toBeTruthy()
    })
  })
})
