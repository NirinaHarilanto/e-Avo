import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/* Décision du client, le 2026-11-20 : « vous pouvez enlever [le bouton Envoyer] et juste
 * notifier automatiquement les personnes concernées quand une facture est disponible dans leurs
 * espaces respectifs ».
 *
 * Il avait d'abord signalé que le bouton restait proposé sur des documents déjà partagés. La
 * cause était un `useState(false)` : l'état « envoyée » vivait dans la mémoire de l'onglet et
 * nulle part ailleurs. Plutôt que d'améliorer la réponse, le client a supprimé la question —
 * prévenir n'est plus un geste, c'est une conséquence de la création (trigger 0167).
 *
 * Ce que ces tests gardent :
 *   — plus AUCUN bouton d'envoi, sur aucune ligne : un geste qui ne sert plus ne doit pas
 *     subsister, ne serait-ce que pour éviter de notifier deux fois ;
 *   — la mention « Notifié ✓ » ne s'affiche que lorsqu'elle a quelque chose à dire, et dit
 *     QUEL CANAL et QUAND au survol : une notification dans l'espace et un e-mail ne se
 *     cherchent pas au même endroit, et l'élève qui affirme n'avoir rien reçu doit pouvoir être
 *     démenti précisément. */

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      throw new Error(`aucune écriture attendue dans ce test (table : ${table})`)
    },
  },
}))
vi.mock('../../../lib/jetonAcces', () => ({ jetonAcces: async () => 'jeton' }))

const { LigneFacture } = await import('../FacturationAdmin')

function monter(marqueurs: { emailEnvoyeLe?: string | null; notifieLe?: string | null } = {}) {
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
  return render(<LigneFacture item={item} paiementsEtudiant={[]} onImprimer={() => {}} onChange={() => {}} />)
}

describe('ligne de facture — notification du destinataire', () => {
  it('ne propose plus aucun bouton d’envoi', () => {
    monter()

    expect(screen.queryByRole('button', { name: /Envoyer/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Envoyée/ })).toBeNull()
  })

  it('ne propose pas davantage de bouton sur un document déjà notifié', () => {
    monter({ notifieLe: '2026-11-20T12:50:00.000+00:00' })

    expect(screen.queryByRole('button', { name: /Envoy/ })).toBeNull()
  })

  /* Le document est dans l'espace du destinataire : on le constate, avec la date. */
  it('affiche « Notifié ✓ » et la date pour un document posé dans l’espace du destinataire', () => {
    monter({ notifieLe: '2026-11-20T12:50:00.000+00:00' })

    const mention = screen.getByText(/Notifié/)
    expect(mention.title).toMatch(/Disponible dans l’espace du destinataire le 20\/11\/2026/)
  })

  /* L'e-mail du cron compte tout autant : du point de vue de l'administration, la personne a été
     prévenue. Mais le canal est nommé, parce qu'il change où elle doit chercher. */
  it('affiche « Notifié ✓ » pour un document annoncé par e-mail, en nommant ce canal', () => {
    monter({ emailEnvoyeLe: '2026-11-18T06:09:28.849+00:00' })

    expect(screen.getByText(/Notifié/).title).toMatch(/Annoncé par e-mail le 18\/11\/2026/)
  })

  /* Rien à dire tant que rien n'est parti : une mention sur chaque ligne n'apprendrait rien. */
  it('n’affiche aucune mention pour un document dont personne n’a encore été prévenu', () => {
    monter()

    expect(screen.queryByText(/Notifié/)).toBeNull()
  })
})
