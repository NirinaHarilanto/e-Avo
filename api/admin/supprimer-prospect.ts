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
 * financière est ACTIVE — l'admin doit d'abord la traiter via supprimer-ligne-financiere.ts,
 * comme n'importe quelle autre trace financière de l'application. Une fois traitée, en revanche,
 * la ligne supprimée en douceur est purgée ici : sans cela, son `prospect_id` retenait le
 * prospect en base pour toujours (voir le détail plus bas). `diagnostic_calls`, lui, n'a aucune
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

    /* Toutes les lignes financières du prospect, supprimées en douceur comprises : la colonne
       `student_payments.prospect_id` (0056) n'a volontairement ni `on delete cascade` ni
       `on delete set null`, donc chacune de ces lignes retient le prospect en base. Le garde-fou
       ci-dessous ne comptait que les lignes encore actives : une fois le forfait supprimé depuis
       la fiche, il passait, et c'est le DELETE final qui échouait sur une violation de clé
       étrangère brute — la suppression d'un candidat ayant un jour réglé un acompte restait donc
       impossible à jamais (incident du 2026-10-19, candidat collectif « Ludovic bensas »). */
    const { data: paiements, error: erreurLecturePaiements } = await serviceClient
      .from('student_payments')
      .select('id, student_id, supprime_le')
      .in('prospect_id', prospectIds)
    if (erreurLecturePaiements) {
      return Response.json({ error: erreurLecturePaiements.message }, { status: 500 })
    }

    if ((paiements ?? []).some((p) => p.supprime_le === null)) {
      return Response.json(
        { error: 'Ce prospect a déjà un paiement de forfait enregistré : supprimez-le d’abord depuis sa fiche.' },
        { status: 409 },
      )
    }
    /* Une ligne déjà convertie porte AUSSI un titulaire étudiant : elle appartient au dossier de
       l'élève, pas au prospect, et n'a donc rien à faire dans la suppression de celui-ci. Le cas
       ne devrait pas se présenter (le filtre `statut === 'etudiant'` plus haut l'écarte), mais
       `prospects.statut` n'est pas garanti synchronisé avec la réalité des profils : mieux vaut un
       refus explicite qu'une erreur Postgres à l'écran. */
    if ((paiements ?? []).some((p) => p.student_id)) {
      return Response.json(
        { error: 'Ce prospect est déjà rattaché au dossier financier d’un élève : supprimez le compte de l’élève depuis la page Étudiants.' },
        { status: 409 },
      )
    }

    /* Reste les lignes supprimées en douceur et jamais converties : l'admin les a déjà traitées
       depuis la fiche, on les efface pour de bon. Leurs acomptes (`paiement_versements`, 0049) et
       leurs échéances (`paiement_echeances`, 0070) suivent d'eux-mêmes (`on delete cascade`), et
       aucune facture ne peut les référencer (0056 ne génère ni reçu ni facture tant que le
       titulaire est un prospect). */
    if ((paiements ?? []).length > 0) {
      const { error: erreurPurgePaiements } = await serviceClient
        .from('student_payments')
        .delete()
        .in(
          'id',
          (paiements ?? []).map((p) => p.id),
        )
      if (erreurPurgePaiements) {
        return Response.json({ error: erreurPurgePaiements.message }, { status: 500 })
      }
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
