import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Signalé par le client le 2026-11-20, capture à l'appui : « pourquoi le bouton envoyer est
   toujours visible alors que les factures sont déjà partagées avec les étudiants ? »
 *
 * L'état « envoyée » vivait dans un `useState(false)` — donc dans la mémoire de l'onglet, et
 * nulle part ailleurs : il repartait à zéro à chaque rechargement, et ignorait aussi bien les
 * envois faits depuis un autre poste que les e-mails postés par le cron de 6h.
 *
 * Ce que ces tests gardent surtout, c'est la DISTINCTION DES CANAUX, parce qu'elle a failli être
 * perdue en corrigeant : le bouton pose une NOTIFICATION dans l'application
 * (api/admin/notifier.ts → creerNotification, qui n'envoie aucun e-mail), tandis que le cron
 * poste un E-MAIL (modèle 2.3) en reprenant les reçus dont `email_envoye_le` est nul. Inscrire
 * `email_envoye_le` depuis le bouton aurait empêché cet e-mail de partir, alors que l'élève
 * n'aurait eu qu'une cloche dans l'application — un document annoncé à moitié, et une colonne
 * qui affirme un envoi qui n'a pas eu lieu. D'où `notifie_le` (0166), séparée. L'écran, lui,
 * réunit les deux : l'administration se demande si le destinataire a été prévenu, pas par quel
 * tuyau. */

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

function monter(
  marqueurs: { emailEnvoyeLe?: string | null; notifieLe?: string | null } = {},
  onChange = () => {},
) {
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
      email_envoye_le: marqueurs.emailEnvoyeLe ?? null,
      notifie_le: marqueurs.notifieLe ?? null,
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
  /* Le cas exact de la capture : le cron avait déjà posté l'e-mail, l'écran l'ignorait et
     proposait un envoi de plus. */
  it('affiche « Envoyée ✓ », désactivé, pour un reçu déjà annoncé par e-mail', () => {
    monter({ emailEnvoyeLe: '2026-11-18T06:09:28.849+00:00' })

    expect(bouton().textContent).toContain('Envoyée')
    expect(bouton().disabled).toBe(true)
    /* La date ET le canal au survol : une notification et un e-mail ne se cherchent pas au même
       endroit, et l'élève qui dit n'avoir rien reçu doit pouvoir être démenti précisément. */
    expect(bouton().title).toMatch(/Annoncé par e-mail le 18\/11\/2026/)
  })

  it('affiche « Envoyée ✓ » pour un reçu déjà notifié dans l’application', () => {
    monter({ notifieLe: '2026-11-19T10:00:00.000+00:00' })

    expect(bouton().disabled).toBe(true)
    expect(bouton().title).toMatch(/Notifié dans l’application le 19\/11\/2026/)
  })

  it('affiche « Envoyer », actif, pour un reçu jamais annoncé', () => {
    monter()

    expect(bouton().textContent).toBe('Envoyer')
    expect(bouton().disabled).toBe(false)
    expect(bouton().title).toBe('')
  })

  /* L'inscription porte sur `notifie_le`, et SURTOUT PAS sur `email_envoye_le` : le cron doit
     rester libre de poster l'e-mail, que ce bouton n'envoie pas. */
  it('inscrit la notification en base, sans toucher au marqueur d’e-mail', async () => {
    const onChange = vi.fn()
    monter({}, onChange)

    fireEvent.click(bouton())

    await waitFor(() => expect(etat.update).toHaveBeenCalled())
    const valeurs = etat.update.mock.calls[0][0] as Record<string, unknown>
    expect(typeof valeurs.notifie_le).toBe('string')
    expect(Number.isNaN(Date.parse(valeurs.notifie_le as string))).toBe(false)
    expect(valeurs).not.toHaveProperty('email_envoye_le')
    await waitFor(() => expect(bouton().textContent).toContain('Envoyée'))
    expect(onChange).toHaveBeenCalled()
  })

  /* Un envoi qui échoue ne doit rien inscrire : le destinataire n'a rien reçu, et le rappel
     automatique doit encore pouvoir prendre le relais. */
  it('n’inscrit rien quand l’envoi échoue, et laisse le bouton actif', async () => {
    etat.reponseNotifier = { ok: false }
    monter()

    fireEvent.click(bouton())

    await waitFor(() => expect(bouton().disabled).toBe(false))
    expect(etat.update).not.toHaveBeenCalled()
    expect(bouton().textContent).toBe('Envoyer')
  })

  /* L'envoi a bien eu lieu ; seule son inscription a échoué. On ne prétend pas le contraire,
     mais on prévient — le bouton reproposera l'envoi au prochain chargement. */
  it('signale quand l’envoi a réussi mais n’a pas pu être inscrit', async () => {
    etat.update.mockResolvedValueOnce({ error: { message: 'RLS' } })
    monter()

    fireEvent.click(bouton())

    expect(await screen.findByText(/la reproposera au prochain chargement/)).toBeTruthy()
    // Le bouton reste marqué envoyé : le message est bien parti.
    expect(bouton().textContent).toContain('Envoyée')
  })
})
