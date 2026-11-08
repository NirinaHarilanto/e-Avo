import { requireAdmin, AdminAuthError, type AdminContext } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

// Point d'entrée unique pour supprimer une ligne financière (paiement étudiant, rémunération
// professeur, devis, facture) : ces tables n'ont volontairement AUCUNE policy RLS delete côté
// client (voir migrations 0019/0020), pour garder systématiquement une trace claire de toute
// correction plutôt qu'un delete silencieux. `table` est vérifié contre une whitelist en dur —
// jamais un nom de table injecté tel quel dans une requête dynamique non contrôlée.
const TABLES_AUTORISEES = new Set(['student_payments', 'teacher_payments', 'quotes', 'invoices'] as const)
type TableAutorisee = 'student_payments' | 'teacher_payments' | 'quotes' | 'invoices'

/* Colonnes qui DÉSIGNENT encore la ligne au moment du delete. Toutes sont nullables et
   déclarées sans `on delete` (0020, 0029, 0049, 0081) : Postgres refuse alors la suppression
   au lieu de les détacher, et l'admin recevait l'erreur brute du moteur —
   « update or delete on table "invoices" violates foreign key constraint
   "timesheets_invoice_id_fkey" on table "timesheets" » (capture client du 2026-11-08, en
   essayant de supprimer la facture issue d'un relevé d'heures validé).

   Les détacher n'est pas un contournement de la contrainte, c'est ce qu'elle réclame : la ligne
   financière n'existe plus, donc plus rien ne doit la désigner. Un relevé d'heures repasse
   simplement « sans facture émise » — son statut, ses lignes et son montant sont intacts — et
   peut en régénérer une ; et les écritures du grand livre rattachées à une rémunération
   supprimée redeviennent des heures non payées, ce qu'elles sont redevenues en vérité. */
const DEPENDANTS: Record<TableAutorisee, { table: TableAutorisee | 'timesheets' | 'hour_ledger'; colonne: string }[]> = {
  invoices: [{ table: 'timesheets', colonne: 'invoice_id' }],
  quotes: [{ table: 'invoices', colonne: 'quote_id' }],
  student_payments: [{ table: 'invoices', colonne: 'payment_id' }],
  teacher_payments: [
    { table: 'invoices', colonne: 'teacher_payment_id' },
    { table: 'timesheets', colonne: 'teacher_payment_id' },
    { table: 'hour_ledger', colonne: 'teacher_payment_id' },
  ],
}

/* Le nom de la colonne vient d'une table en dur juste au-dessus, jamais de la requête : le
   client typé n'accepte pas une clé calculée, d'où cette vue restreinte sur `update`. */
async function detacher(
  serviceClient: AdminContext['serviceClient'],
  dependant: { table: string; colonne: string },
  id: string,
  etablissementId: string,
): Promise<string | null> {
  const requete = serviceClient.from(dependant.table as 'invoices') as unknown as {
    update: (valeurs: Record<string, null>) => {
      eq: (colonne: string, valeur: string) => {
        eq: (colonne: string, valeur: string) => Promise<{ error: { message: string } | null }>
      }
    }
  }
  const { error } = await requete
    .update({ [dependant.colonne]: null })
    .eq(dependant.colonne, id)
    .eq('etablissement_id', etablissementId)
  return error ? error.message : null
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as { table?: string; id?: string }
    if (!body.table || !body.id || !TABLES_AUTORISEES.has(body.table as TableAutorisee)) {
      return Response.json({ error: 'Table ou identifiant invalide.' }, { status: 400 })
    }

    const table = body.table as TableAutorisee

    /* Vérifié AVANT de détacher quoi que ce soit : sans ce contrôle, un identifiant d'un autre
       établissement ferait passer la boucle ci-dessous avant d'échouer au 404 du delete. */
    const { data: ligne } = await serviceClient
      .from(table)
      .select('id')
      .eq('id', body.id)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()
    if (!ligne) {
      return Response.json({ error: 'Ligne introuvable.' }, { status: 404 })
    }

    for (const dependant of DEPENDANTS[table]) {
      const message = await detacher(serviceClient, dependant, body.id, etablissementId)
      if (message) {
        return Response.json({ error: message }, { status: 500 })
      }
    }

    const { error, count } = await serviceClient
      .from(table)
      .delete({ count: 'exact' })
      .eq('id', body.id)
      .eq('etablissement_id', etablissementId)

    if (error) {
      /* Filet : si une référence encore inconnue de DEPENDANTS apparaît un jour, l'admin lit une
         phrase en français plutôt que le message brut du moteur Postgres, en anglais. */
      const estContrainte = error.message.includes('violates foreign key constraint')
      return Response.json(
        {
          error: estContrainte
            ? 'Cette ligne est encore rattachée à un autre document et ne peut pas être supprimée en l’état.'
            : error.message,
        },
        { status: estContrainte ? 409 : 500 },
      )
    }
    if (!count) {
      return Response.json({ error: 'Ligne introuvable.' }, { status: 404 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
