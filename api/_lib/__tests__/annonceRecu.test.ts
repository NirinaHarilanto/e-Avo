import { describe, expect, it, vi } from 'vitest'
import { annoncerRecu } from '../annonceRecu.js'

/* Demande du client, le 2026-11-25 : « quand le paiement est enregistré par l'admin, l'envoi du
 * mail automatique doit être instantané pour confirmer au payeur que l'admin a bien reçu le
 * paiement ». L'annonce ne passe donc plus seulement par le cron de 9 h.
 *
 * Ces tests gardent la règle la plus coûteuse à perdre : `email_envoye_le` est posé MÊME quand
 * l'envoi échoue. Sans elle, un établissement sans clé Resend verrait le cron reprendre tous ses
 * reçus à chaque passage — c'est la mécanique exacte qui a expédié 34 remerciements de trop les
 * 24 et 25 novembre. */

const RECU = {
  id: 'inv-1',
  etablissement_id: 'etab-1',
  student_id: 'eleve-1',
  montant_ttc: 300000,
  numero: 'REC-2026-abcd1234',
}

/** Client Supabase réduit à ce que `annoncerRecu` lui demande. */
function clientSimule({ email }: { email: string | null }) {
  const misAJour: { id: string; champs: Record<string, unknown> }[] = []
  const client = {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: email ? { prenom: 'Tovo', email } : null }),
            }),
          }),
        }
      }
      if (table === 'email_templates') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    objet: 'Paiement reçu',
                    corps: 'Bonjour {{prenom}}, nous avons bien reçu votre paiement de {{montant}}.',
                    actif: true,
                    piece_jointe_document_id: null,
                  },
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'email_variables') {
        return { select: () => ({ eq: async () => ({ data: [] }) }) }
      }
      if (table === 'etablissements') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      }
      if (table === 'creneaux_test_positionnement') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ gte: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }),
          }),
        }
      }
      return {
        update: (champs: Record<string, unknown>) => ({
          eq: async (_colonne: string, id: string) => {
            misAJour.push({ id, champs })
            return { error: null }
          },
        }),
      }
    },
  }
  return { client, misAJour }
}

describe('annoncerRecu', () => {
  it('marque le reçu annoncé même quand l’e-mail ne part pas', async () => {
    const { client, misAJour } = clientSimule({ email: 'tovo@example.mg' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('non', { status: 500 })))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envoye = await annoncerRecu(client as any, RECU)

    expect(envoye).toBe(false)
    expect(misAJour).toHaveLength(1)
    expect(misAJour[0].id).toBe('inv-1')
    expect(misAJour[0].champs.email_envoye_le).toEqual(expect.any(String))
  })

  /* Un élève sans adresse ne peut rien recevoir. On ne marque alors RIEN : le jour où son adresse
     est renseignée, le cron rattrapera l'annonce. */
  it('ne marque rien quand l’élève n’a pas d’adresse', async () => {
    const { client, misAJour } = clientSimule({ email: null })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envoye = await annoncerRecu(client as any, RECU)

    expect(envoye).toBe(false)
    expect(misAJour).toHaveLength(0)
  })

  it('n’annonce pas un reçu sans élève rattaché', async () => {
    const { client, misAJour } = clientSimule({ email: 'tovo@example.mg' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envoye = await annoncerRecu(client as any, { ...RECU, student_id: null })

    expect(envoye).toBe(false)
    expect(misAJour).toHaveLength(0)
  })
})
