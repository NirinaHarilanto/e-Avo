import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

// Point d'entrée unique pour supprimer une ligne financière (paiement étudiant, rémunération
// professeur, devis, facture) : ces tables n'ont volontairement AUCUNE policy RLS delete côté
// client (voir migrations 0019/0020), pour garder systématiquement une trace claire de toute
// correction plutôt qu'un delete silencieux. `table` est vérifié contre une whitelist en dur —
// jamais un nom de table injecté tel quel dans une requête dynamique non contrôlée.
const TABLES_AUTORISEES = new Set(['student_payments', 'teacher_payments', 'quotes', 'invoices'] as const)
type TableAutorisee = 'student_payments' | 'teacher_payments' | 'quotes' | 'invoices'

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

    const { error, count } = await serviceClient
      .from(body.table as TableAutorisee)
      .delete({ count: 'exact' })
      .eq('id', body.id)
      .eq('etablissement_id', etablissementId)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
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
