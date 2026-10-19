import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

/**
 * Supprime un prospect (ou une paire DUO, traitée d'un bloc comme partout ailleurs dans le
 * pipeline — voir CarteDuo.tsx) depuis n'importe quelle colonne du Kanban — demande client du
 * 2026-09-23.
 *
 * Contrairement à un étudiant/professeur (soft-delete, voir supprimer-utilisateur.ts), un
 * prospect n'est pas un compte : rien ne l'empêche d'être vraiment effacé. Ses lignes
 * financières (`student_payments.prospect_id`, 0056) partent avec lui, mais JAMAIS en silence :
 * tant que `confirmerSuppressionFinanciere` n'est pas envoyé, la route refuse et renvoie la
 * liste chiffrée des encaissements concernés, que la pop-up affiche avant de redemander
 * (décision client du 2026-10-19 : « tout emporter, après confirmation du montant »). Avant
 * conversion, aucune facture ni aucun reçu ne peut exister sur ces lignes — 0056 n'en génère
 * pas tant que le titulaire est un prospect —, donc rien de comptable ne se brise. Une ligne
 * portant AUSSI un `student_id` est en revanche toujours refusée : elle appartient au dossier
 * d'un élève, pas au candidat. `diagnostic_calls`, lui, n'a aucune
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
    const body = (await request.json()) as { prospectIds?: string[]; confirmerSuppressionFinanciere?: boolean }
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
      .select('id, student_id, supprime_le, montant, montant_regle, devise, notes')
      .in('prospect_id', prospectIds)
    if (erreurLecturePaiements) {
      return Response.json({ error: erreurLecturePaiements.message }, { status: 500 })
    }
    const lignesFinancieres = paiements ?? []

    /* Une ligne déjà convertie porte AUSSI un titulaire étudiant : elle appartient au dossier de
       l'élève, pas au prospect, et n'a donc rien à faire dans la suppression de celui-ci. Le cas
       ne devrait pas se présenter (le filtre `statut === 'etudiant'` plus haut l'écarte), mais
       `prospects.statut` n'est pas garanti synchronisé avec la réalité des profils : mieux vaut un
       refus explicite qu'une erreur Postgres à l'écran. */
    if (lignesFinancieres.some((p) => p.student_id)) {
      return Response.json(
        { error: 'Ce prospect est déjà rattaché au dossier financier d’un élève : supprimez le compte de l’élève depuis la page Étudiants.' },
        { status: 409 },
      )
    }

    /* Les encaissements encore actifs ne partent jamais sans que l'admin ait VU ce qu'il efface.
       Ce premier refus n'est donc pas un cul-de-sac comme avant (il renvoyait vers une autre
       section, où la ligne restait d'ailleurs invisible avant conversion) : il porte les montants,
       que la pop-up affiche telle quelle avant de rappeler la route avec la confirmation. */
    const actives = lignesFinancieres.filter((p) => p.supprime_le === null)
    if (actives.length > 0 && !body.confirmerSuppressionFinanciere) {
      return Response.json(
        {
          error:
            actives.length === 1
              ? 'Ce candidat a un encaissement actif : confirmez pour l’effacer avec son dossier.'
              : `Ce candidat a ${actives.length} encaissements actifs : confirmez pour les effacer avec son dossier.`,
          lignesFinancieres: actives.map((p) => ({
            id: p.id,
            montant: Number(p.montant),
            montantRegle: Number(p.montant_regle),
            devise: p.devise,
            libelle: p.notes ?? null,
          })),
        },
        { status: 409 },
      )
    }

    /* Purge de TOUTES les lignes, actives confirmées comme déjà supprimées en douceur : ces
       dernières gardent leur `prospect_id` (0056 n'a volontairement ni cascade ni `set null`),
       donc les oublier ferait échouer le DELETE ci-dessous sur une violation de clé étrangère —
       c'est ce qui rendait indélébile un candidat dont la ligne avait pourtant été traitée.
       Leurs acomptes (`paiement_versements`, 0049) et leurs échéances (`paiement_echeances`,
       0070) suivent d'eux-mêmes (`on delete cascade`). */
    if (lignesFinancieres.length > 0) {
      /* `invoices.payment_id` (0020) n'a pas de cascade : une facture rattachée ferait échouer la
         purge sur une erreur Postgres brute. Le cas ne peut normalement pas exister (le bouton
         « Générer une facture » est désactivé tant que le titulaire est un prospect, et 0056 ne
         produit aucun reçu automatique), mais le vérifier coûte une requête et garde l'écran
         lisible si une facture apparaissait par un autre chemin. */
      const { count: nombreFactures } = await serviceClient
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .in(
          'payment_id',
          lignesFinancieres.map((p) => p.id),
        )
      if (nombreFactures && nombreFactures > 0) {
        return Response.json(
          { error: 'Une facture est rattachée à l’encaissement de ce candidat : annulez-la avant de supprimer le dossier.' },
          { status: 409 },
        )
      }

      const { error: erreurPurgePaiements } = await serviceClient
        .from('student_payments')
        .delete()
        .in(
          'id',
          lignesFinancieres.map((p) => p.id),
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
