import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Signalé par le client le 2026-11-08, capture à l'appui : supprimer la facture d'un relevé
   d'heures validé affichait, en rouge sous la ligne, le message brut du moteur —
   « update or delete on table "invoices" violates foreign key constraint
   "timesheets_invoice_id_fkey" on table "timesheets" » — et la facture restait là.

   Quatre tables passent par cette route, et chacune est désignée par au moins une colonne
   nullable déclarée sans `on delete` (0020, 0029, 0049, 0081) : le même mur attendait les trois
   autres. Ce fichier garde le détachement préalable, table par table, et l'ordre dans lequel il
   se fait — jamais avant d'avoir vérifié que la ligne appartient bien à l'établissement. */

let ligneTrouvee: { id: string } | null = { id: 'fac-1' }
let detachements: { table: string; valeurs: Record<string, null>; filtres: [string, unknown][] }[] = []
let suppressions: { table: string; filtres: [string, unknown][] }[] = []
let erreurSuppression: { message: string } | null = null

function clientFactice() {
  return {
    from(table: string) {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ligneTrouvee }) }) }) }),
        update: (valeurs: Record<string, null>) => {
          const filtres: [string, unknown][] = []
          const chainon = {
            eq: (colonne: string, valeur: unknown) => {
              filtres.push([colonne, valeur])
              if (filtres.length < 2) return chainon
              detachements.push({ table, valeurs, filtres })
              return Promise.resolve({ error: null })
            },
          }
          return chainon
        },
        delete: () => {
          const filtres: [string, unknown][] = []
          const chainon = {
            eq: (colonne: string, valeur: unknown) => {
              filtres.push([colonne, valeur])
              if (filtres.length < 2) return chainon
              suppressions.push({ table, filtres })
              return Promise.resolve({ error: erreurSuppression, count: erreurSuppression ? null : 1 })
            },
          }
          return chainon
        },
      }
    },
  }
}

vi.mock('../../_lib/adminAuth.js', () => ({
  requireAdmin: vi.fn(async (..._args: unknown[]) => ({
    serviceClient: clientFactice(),
    profileId: 'admin-1',
    etablissementId: 'etab-1',
  })),
  AdminAuthError: class AdminAuthError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

const { default: handler } = await import('../supprimer-ligne-financiere.js')

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/admin/supprimer-ligne-financiere', {
    method: 'POST',
    body: JSON.stringify(corps),
  })
}

beforeEach(() => {
  ligneTrouvee = { id: 'fac-1' }
  detachements = []
  suppressions = []
  erreurSuppression = null
})

describe('api/admin/supprimer-ligne-financiere — détachement avant suppression', () => {
  it('détache timesheets.invoice_id avant de supprimer la facture', async () => {
    const reponse = await handler(requete({ table: 'invoices', id: 'fac-1' }))

    expect(reponse.status).toBe(200)
    expect(detachements).toEqual([
      {
        table: 'timesheets',
        valeurs: { invoice_id: null },
        filtres: [
          ['invoice_id', 'fac-1'],
          ['etablissement_id', 'etab-1'],
        ],
      },
    ])
    expect(suppressions.map((s) => s.table)).toEqual(['invoices'])
  })

  it('détache invoices.quote_id avant de supprimer un devis', async () => {
    await handler(requete({ table: 'quotes', id: 'fac-1' }))

    expect(detachements).toEqual([expect.objectContaining({ table: 'invoices', valeurs: { quote_id: null } })])
  })

  it('détache invoices.payment_id avant de supprimer un paiement étudiant', async () => {
    await handler(requete({ table: 'student_payments', id: 'fac-1' }))

    expect(detachements).toEqual([expect.objectContaining({ table: 'invoices', valeurs: { payment_id: null } })])
  })

  /* Le cas le plus lourd de conséquences : une rémunération professeur est désignée depuis
     trois tables, dont le grand livre. Détacher `hour_ledger.teacher_payment_id` fait
     redevenir ces heures NON payées — ce qu'elles sont, puisque le paiement n'existe plus. */
  it('détache les trois références d’une rémunération professeur, grand livre compris', async () => {
    await handler(requete({ table: 'teacher_payments', id: 'fac-1' }))

    expect(detachements.map((d) => `${d.table}.${Object.keys(d.valeurs)[0]}`)).toEqual([
      'invoices.teacher_payment_id',
      'timesheets.teacher_payment_id',
      'hour_ledger.teacher_payment_id',
    ])
    expect(suppressions.map((s) => s.table)).toEqual(['teacher_payments'])
  })
})

describe('api/admin/supprimer-ligne-financiere — garde-fous', () => {
  /* Sans la vérification d'appartenance EN PREMIER, un identifiant d'un autre établissement
     ferait traverser la boucle de détachement avant d'échouer sur le 404 du delete. */
  it('ne détache rien quand la ligne est introuvable dans l’établissement', async () => {
    ligneTrouvee = null

    const reponse = await handler(requete({ table: 'invoices', id: 'ailleurs' }))

    expect(reponse.status).toBe(404)
    expect(detachements).toEqual([])
    expect(suppressions).toEqual([])
  })

  it('refuse une table hors de la liste blanche', async () => {
    const reponse = await handler(requete({ table: 'profiles', id: 'fac-1' }))

    expect(reponse.status).toBe(400)
    expect(detachements).toEqual([])
  })

  it('refuse une requête sans identifiant', async () => {
    const reponse = await handler(requete({ table: 'invoices' }))
    expect(reponse.status).toBe(400)
  })

  /* Filet pour une référence qu'on n'aurait pas encore recensée : l'admin doit lire une phrase
     en français, pas le message du moteur Postgres. */
  it('traduit une contrainte résiduelle plutôt que d’afficher l’erreur Postgres', async () => {
    erreurSuppression = {
      message:
        'update or delete on table "invoices" violates foreign key constraint "autre_fkey" on table "autre"',
    }

    const reponse = await handler(requete({ table: 'invoices', id: 'fac-1' }))
    const corps = (await reponse.json()) as { error: string }

    expect(reponse.status).toBe(409)
    expect(corps.error).toBe(
      'Cette ligne est encore rattachée à un autre document et ne peut pas être supprimée en l’état.',
    )
  })
})
