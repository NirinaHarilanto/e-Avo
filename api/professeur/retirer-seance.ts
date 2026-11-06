import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { integrationHoteDeLaSession, supprimerEvenement } from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  sessionId?: string
}

/**
 * Retire une séance du parcours d'un élève — demande client du 2026-11-05 : « sur les séances
 * listées dans parcours pédagogique, on doit pouvoir avoir un icône qui permet de retirer
 * visuellement la séance ». Ouvert au professeur le 2026-11-06 (même journée que le reste) :
 * « est-ce que tu as également rajouté la fonctionnalité [...] dans les espaces professeurs ? ».
 *
 * Remplace `api/admin/retirer-seance.ts` (même logique, déplacée ici) : exactement le même
 * partage admin/professeur que `annuler-seance.ts` et `modifier-seance.ts`, via
 * `requireTeacherOrAdmin`.
 *
 * Portée du professeur, volontairement plus étroite que celle de l'admin (décision client du
 * 2026-11-06) :
 *   — uniquement SES PROPRES séances (`session.teacher_id === profileId`) ;
 *   — uniquement une séance encore PLANIFIÉE ou déjà ANNULÉE — JAMAIS une séance CLÔTURÉE
 *     (« terminée ») ou REPORTÉE. Ces deux statuts-là n'ont jamais écrit au grand livre
 *     (`hour_ledger` ne reçoit d'écriture qu'à la clôture, voir cloturer-seance.ts) : aucune
 *     heure n'est donc jamais à faire revenir pour ce chemin-ci, à la différence de l'admin.
 * L'admin, lui, garde la portée complète : n'importe quelle séance de l'établissement, y compris
 * déjà clôturée, avec reversement des écritures du grand livre.
 *
 * La séance est VRAIMENT supprimée, pas masquée. Un simple drapeau « retirée » obligerait à
 * filtrer partout où une séance s'affiche — parcours, agendas de l'élève, du professeur et de
 * l'admin, « Séances & visio », compteurs d'assiduité — et le moindre oubli la ferait réapparaître
 * là où on croit l'avoir retirée. C'est exactement le travers corrigé le 2026-10-19
 * (« supprimé ne doit plus empêcher ni compter »).
 *
 * Ce qui part avec elle, dans cet ordre :
 *   1. ses écritures du grand livre, s'il y en a (admin uniquement en pratique, voir plus haut) —
 *      `hour_ledger` est la SEULE table référençant `sessions` SANS `on delete cascade` avec
 *      `session_reports` et `session_satisfaction` (0011/0033/0068). Les retirer d'abord est ce
 *      qui fait revenir les compteurs de l'élève ET du professeur à leur valeur d'avant la
 *      clôture ;
 *   2. son compte rendu et son enquête de satisfaction, mêmes tables sans cascade ;
 *   3. la séance, qui emporte en cascade son inscription (0009) et sa ligne de visio (0013) ;
 *   4. son événement dans l'agenda Google, qui resterait sinon orphelin.
 *
 * REFUSÉE (pour l'admin comme pour un professeur dont les heures sont exceptionnellement déjà
 * comptées) quand ses heures sont déjà payées ou déjà déclarées sur un TimeSheet : une fiche de
 * paie émise ne se réécrit jamais (même règle qu'un forfait payé, 0057). L'admin est renvoyé vers
 * la correction manuelle du compteur, qui, elle, ajoute une écriture au lieu d'en détruire une.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    const corps = (await request.json()) as Corps
    const sessionId = corps.sessionId?.trim()

    if (!sessionId) {
      return Response.json({ error: 'Séance manquante.' }, { status: 400 })
    }

    const { data: seance } = await serviceClient
      .from('sessions')
      .select('id, debut, statut, teacher_id, etablissement_id')
      .eq('id', sessionId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()

    if (!seance) {
      return Response.json({ error: 'Séance introuvable dans votre établissement.' }, { status: 404 })
    }

    const estAdmin = roles.includes('admin_etablissement')
    if (!estAdmin && seance.teacher_id !== profileId) {
      return Response.json({ error: "Cette séance n'est pas la vôtre." }, { status: 403 })
    }
    if (!estAdmin && seance.statut !== 'planifiee' && seance.statut !== 'annulee') {
      return Response.json(
        {
          error:
            'Seule une séance encore planifiée ou déjà annulée peut être retirée depuis votre espace. ' +
            'Pour une séance clôturée, contactez l’administration.',
        },
        { status: 409 },
      )
    }

    const { data: ecritures } = await serviceClient
      .from('hour_ledger')
      .select('id, heures, type_ecriture, teacher_payment_id, timesheet_id')
      .eq('session_id', sessionId)

    const verrouillees = (ecritures ?? []).filter((e) => e.teacher_payment_id !== null || e.timesheet_id !== null)
    if (verrouillees.length > 0) {
      return Response.json(
        {
          error:
            'Les heures de cette séance sont déjà payées ou déclarées sur un TimeSheet : elle ne peut plus être retirée. ' +
            'Corrigez le compteur depuis « Heures suivies › Modifier », qui ajoute une correction sans réécrire une paie émise.',
        },
        { status: 409 },
      )
    }

    /* L'identifiant de l'événement Google est lu AVANT la suppression : `video_sessions` part en
       cascade avec la séance, et l'événement deviendrait introuvable. */
    const { data: visio } = await serviceClient
      .from('video_sessions')
      .select('google_event_id')
      .eq('session_id', sessionId)
      .maybeSingle()
    const eventId = visio?.google_event_id ?? null

    /* L'hôte aussi se résout avant : `integrationHoteDeLaSession` part de la séance, qui
       n'existera plus. */
    const hote = eventId
      ? await integrationHoteDeLaSession(serviceClient, sessionId, etablissementId).catch(() => null)
      : null

    const heuresRetirees = (ecritures ?? [])
      .filter((e) => e.type_ecriture === 'debit_etudiant')
      .reduce((total, e) => total + Number(e.heures), 0)

    // 1 — le grand livre, qui n'a pas de cascade : c'est lui qui fait revenir les compteurs.
    const { error: erreurLedger } = await serviceClient.from('hour_ledger').delete().eq('session_id', sessionId)
    if (erreurLedger) {
      return Response.json({ error: erreurLedger.message }, { status: 500 })
    }

    // 2 — compte rendu et enquête, mêmes tables sans cascade.
    await serviceClient.from('session_reports').delete().eq('session_id', sessionId)
    await serviceClient.from('session_satisfaction').delete().eq('session_id', sessionId)

    // 3 — la séance, et en cascade son inscription et sa ligne de visio.
    const { error: erreurSeance } = await serviceClient.from('sessions').delete().eq('id', sessionId)
    if (erreurSeance) {
      return Response.json({ error: erreurSeance.message }, { status: 500 })
    }

    // 4 — l'événement d'agenda, désormais sans contrepartie. Best effort : la séance est déjà
    // retirée côté HOC, un refus de Google ne doit pas faire croire que rien n'a été fait.
    let agenda: 'retire' | 'non retire' | 'aucun' = 'aucun'
    if (eventId && hote) {
      agenda = await supprimerEvenement(hote, eventId)
        .then(() => 'retire' as const)
        .catch(() => 'non retire' as const)
    } else if (eventId) {
      agenda = 'non retire'
    }

    return Response.json({ ok: true, heuresRetirees, agenda, statut: seance.statut })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
