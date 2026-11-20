import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Signalé par le client le 2026-11-20, capture à l'appui : « pourquoi le bouton envoyer est
   toujours visible alors que les factures sont déjà partagées avec les étudiants ? »
 *
 * L'état « envoyée » vivait dans un `useState(false)` — donc dans la mémoire de l'onglet, et
 * nulle part ailleurs. Deux conséquences, vérifiées en production :
 *
 *   — un reçu annoncé par le cron de 6h (modèle 2.3) s'affichait « Envoyer », invitant
 *     l'administration à un envoi de plus ;
 *   — un reçu envoyé à la main n'écrivait pas `email_envoye_le`, et le cron, qui reprend
 *     justement les reçus dont cette colonne est nulle, le RÉANNONÇAIT le lendemain matin.
 *     REC-2026-bc94d1a4, celui de la capture marqué « Envoyée ✓ », était dans ce cas.
 *
 * Ces tests gardent les deux sens, parce que c'est leur combinaison qui envoyait deux fois le
 * même message à un élève. */

const etat = vi.hoisted(() => ({
  update: vi.fn(async (_valeurs: unknown) => ({ error: null as { message: string } | null })),
  reponseNotifier: { ok: true },
}))

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'invoices') throw new Error(`table inattendue dans ce test : ${table}`)
      return { update: (valeurs: unknown) => ({ eq: () => etat.update(valeurs as never) }) }
    },
  },
}))
vi.mock('../../../lib/jetonAcces', () => ({ jetonAcces: async () => 'jeton' }))

const { LigneFacture } = await import('../FacturationAdmin')

function monter(emailEnvoyeLe: string | null, onChange = () => {}) {
  const item = {
    facture: {
      id: 'facture-1',
      etablissement_id: 'etab-1',
      numero: 'REC-2026-bc94d1a4',
      statut: 'payee',
      objet: 'Reçu — forfait individuel (15 h)',
      montant_ttc: 400000,
      payment_id: null,
      teacher_id: null,
      email_envoye_le: emailEnvoyeLe,
    },
    destinataire: { id: 'etu-1', prenom: 'Mbolatiana', nom: 'RAKOTOBE' },
    duoPartenaire: null,
  } as unknown as Parameters<typeof LigneFacture>[0]['item']
  return render(<LigneFacture item={item} paiementsEtudiant={[]} onImprimer={() => {}} onChange={onChange} />)
}

const bouton = () => screen.getByRole('button', { name: /Envoy/ }) as HTMLButtonElement

beforeEach(() => {
  etat.update.mockClear()
  etat.reponseNotifier = { ok: true }
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: etat.reponseNotifier.ok }), { status: etat.reponseNotifier.ok ? 200 : 500 })) as never
})

describe('bouton « Envoyer » d’un reçu', () => {
  /* Le sens que le client a vu : le cron avait déjà annoncé ces reçus, l'écran l'ignorait. */
  it('affiche « Envoyée ✓ », désactivé, pour un reçu déjà annoncé', () => {
    monter('2026-11-18T06:09:28.849+00:00')

    expect(bouton().textContent).toContain('Envoyée')
    expect(bouton().disabled).toBe(true)
    // La date au survol : « envoyée » sans quand ne permet pas de trancher si l'élève qui dit
    // n'avoir rien reçu a raison.
    expect(bouton().title).toMatch(/18\/11\/2026/)
  })

  it('affiche « Envoyer », actif, pour un reçu jamais annoncé', () => {
    monter(null)

    expect(bouton().textContent).toBe('Envoyer')
    expect(bouton().disabled).toBe(false)
    expect(bouton().title).toBe('')
  })

  /* Le sens le plus coûteux : sans cette écriture, le cron de 6h renvoie le même message. */
  it('inscrit l’annonce en base après un envoi réussi', async () => {
    const onChange = vi.fn()
    monter(null, onChange)

    fireEvent.click(bouton())

    await waitFor(() => expect(etat.update).toHaveBeenCalled())
    const valeurs = etat.update.mock.calls[0][0] as { email_envoye_le: string }
    expect(valeurs.email_envoye_le).toBeTruthy()
    expect(Number.isNaN(Date.parse(valeurs.email_envoye_le))).toBe(false)
    await waitFor(() => expect(bouton().textContent).toContain('Envoyée'))
    expect(onChange).toHaveBeenCalled()
  })

  /* Un envoi qui échoue ne doit rien inscrire : le destinataire n'a rien reçu, et le rappel
     automatique doit encore pouvoir prendre le relais. */
  it('n’inscrit rien quand l’envoi échoue, et laisse le bouton actif', async () => {
    etat.reponseNotifier = { ok: false }
    monter(null)

    fireEvent.click(bouton())

    await waitFor(() => expect(bouton().disabled).toBe(false))
    expect(etat.update).not.toHaveBeenCalled()
    expect(bouton().textContent).toBe('Envoyer')
  })

  /* L'envoi a bien eu lieu ; seule son inscription a échoué. On ne prétend pas le contraire,
     mais on prévient — la conséquence (un second e-mail demain matin) regarde l'administration. */
  it('signale quand l’envoi a réussi mais n’a pas pu être inscrit', async () => {
    etat.update.mockResolvedValueOnce({ error: { message: 'RLS' } })
    monter(null)

    fireEvent.click(bouton())

    expect(await screen.findByText(/le rappel automatique risque de le renvoyer/)).toBeTruthy()
    // Le bouton reste marqué envoyé : le message est bien parti.
    expect(bouton().textContent).toContain('Envoyée')
  })
})
