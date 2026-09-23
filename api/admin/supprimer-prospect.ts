import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

/**
 * Supprime un prospect (ou une paire DUO, traitée d'un bloc comme partout ailleurs dans le
 * pipeline — voir CarteDuo.tsx) depuis n'importe quelle colonne du Kanban — demande client du
 * 2026-09-23.
 *
 * Contrairement à un étudiant/professeur (soft-delete, voir supprimer-utilisateur.ts), un
 * prospect n'est pas un compte : rien ne l'empêche d'être vraiment effacé. Les FK sans cascade
 * protègent déjà ce qui compte : un prospect qui a déjà réglé un acompte de forfait
 * (`student_payments.prospect_id`, 0056) ne peut pas être supprimé tant que cette ligne
 * financière existe — l'admin doit d'abord la traiter via supprimer-ligne-financiere.ts, comme
 * n'importe quelle autre trace financière de l'application. `diagnostic_calls`, lui, n'a aucune
 * portée financière : supprimé avec le prospect, volontairement (sinon « supprimer un prospect
 * à chaque étape », y compris après son diagnostic, resterait impossible — la contrainte FK
 * bloquerait juste la suppression). `rendez_vous` et `test_positionnement_inscriptions` cascadent
 * déjà au niveau base (`on delete cascade`, 0042/0051), et `duo_partenaire_id` de l'éventuel
 * partenaire repasse tout seul à `null` (`on delete set null`, 0054).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as { prospectIds?: string[] }
    const prospectIds = [...new Set((body.prospectIds ?? []).filter(Boolean))]
    if (prospectIds.length === 0 || prospectIds.length > 2) {
      return Response.json({ error: 'Identifiant(s) de prospect invalide(s).' }, { status: 400 })
    }

    const { data: prospects, error: erreurProspects } = await serviceClient
      .from('prospects')
      .select('id, etablissement_id, statut')
      .in('id', prospectIds)
    if (erreurProspects) {
      return Response.json({ error: erreurProspects.message }, { status: 500 })
    }
    if (
      !prospects ||
      prospects.length !== prospectIds.length ||
      prospects.some((p) => p.etablissement_id !== etablissementId || p.statut === 'etudiant')
    ) {
      return Response.json({ error: 'Prospect introuvable pour cet établissement.' }, { status: 404 })
    }

    const { count: nombrePaiements } = await serviceClient
      .from('student_payments')
      .select('id', { count: 'exact', head: true })
      .in('prospect_id', prospectIds)
      .is('supprime_le', null)
    if (nombrePaiements && nombrePaiements > 0) {
      return Response.json(
        { error: 'Ce prospect a déjà un paiement de forfait enregistré : supprimez-le d’abord depuis sa fiche.' },
        { status: 409 },
      )
    }

    const { error: erreurDiagnostics } = await serviceClient.from('diagnostic_calls').delete().in('prospect_id', prospectIds)
    if (erreurDiagnostics) {
      return Response.json({ error: erreurDiagnostics.message }, { status: 500 })
    }

    const { error: erreurSuppression, count } = await serviceClient
      .from('prospects')
      .delete({ count: 'exact' })
      .in('id', prospectIds)
      .eq('etablissement_id', etablissementId)
    if (erreurSuppression) {
      return Response.json({ error: erreurSuppression.message }, { status: 500 })
    }
    if (!count) {
      return Response.json({ error: 'Prospect introuvable.' }, { status: 404 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
