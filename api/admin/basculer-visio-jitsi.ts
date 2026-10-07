import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { integrationDeLEtablissement, modifierEvenementVisio, type IntegrationGoogle } from '../_lib/google.js'
import { creerLienJitsi } from '../../src/lib/visio.js'

export const config = { runtime: 'edge' }

/**
 * Rattrapage des réunions créées AVANT la bascule vers Jitsi (2026-10-07).
 *
 * Les liens meet.google.com déjà distribués restent fermés aux élèves sans compte Google : les
 * régénérer est la seule façon de tenir la promesse envers les participants déjà convoqués.
 * Chaque réunion reçoit une salle Jitsi, enregistrée en base ET posée sur l'événement Google
 * Calendar correspondant — `sendUpdates=all` fait que Google renvoie lui-même l'invitation à jour
 * à chaque participant, qui reçoit donc le nouveau lien sans qu'on écrive le moindre e-mail.
 *
 * Idempotente et relançable : seules les lignes portant encore un lien meet.google.com sont
 * traitées, donc un second appel ne redistribue pas de nouveaux liens à ceux déjà basculés.
 *
 * Les réunions passées sont laissées telles quelles : régénérer le lien d'un cours déjà donné
 * n'apporte rien et enverrait une invitation inutile à ses participants.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const maintenant = new Date().toISOString()
    const integration = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)

    const rapport: { table: string; id: string; calendrier: 'mis a jour' | 'non synchronise' }[] = []
    const echecs: { table: string; id: string; raison: string }[] = []

    // ── Rendez-vous de prospection ────────────────────────────────────────────
    const { data: rdv } = await serviceClient
      .from('rendez_vous')
      .select('id, google_event_id, lien_meet')
      .eq('etablissement_id', etablissementId)
      .like('lien_meet', '%meet.google.com%')
      .gte('debut', maintenant)

    for (const ligne of rdv ?? []) {
      const lienVisio = creerLienJitsi()
      const { error } = await serviceClient.from('rendez_vous').update({ lien_meet: lienVisio }).eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'rendez_vous', id: ligne.id, raison: error.message })
        continue
      }
      const calendrier = await poser(integration, ligne.google_event_id, lienVisio)
      rapport.push({ table: 'rendez_vous', id: ligne.id, calendrier })
    }

    // ── Événements d'agenda (admin et professeurs) ────────────────────────────
    const { data: evenements } = await serviceClient
      .from('evenements_admin')
      .select('id, google_event_id, lien_meet')
      .eq('etablissement_id', etablissementId)
      .like('lien_meet', '%meet.google.com%')
      .gte('debut', maintenant)

    for (const ligne of evenements ?? []) {
      const lienVisio = creerLienJitsi()
      const { error } = await serviceClient.from('evenements_admin').update({ lien_meet: lienVisio }).eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'evenements_admin', id: ligne.id, raison: error.message })
        continue
      }
      const calendrier = await poser(integration, ligne.google_event_id, lienVisio)
      rapport.push({ table: 'evenements_admin', id: ligne.id, calendrier })
    }

    // ── Sessions de test oral ─────────────────────────────────────────────────
    const { data: creneaux } = await serviceClient
      .from('creneaux_test_positionnement')
      .select('id, google_event_id, lien_visio')
      .eq('etablissement_id', etablissementId)
      .like('lien_visio', '%meet.google.com%')
      .gte('debut', maintenant)

    for (const ligne of creneaux ?? []) {
      const lienVisio = creerLienJitsi()
      const { error } = await serviceClient
        .from('creneaux_test_positionnement')
        .update({ lien_visio: lienVisio })
        .eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'creneaux_test_positionnement', id: ligne.id, raison: error.message })
        continue
      }
      const calendrier = await poser(integration, ligne.google_event_id, lienVisio)
      rapport.push({ table: 'creneaux_test_positionnement', id: ligne.id, calendrier })
    }

    // ── Séances de cours ──────────────────────────────────────────────────────
    const { data: visios } = await serviceClient
      .from('video_sessions')
      .select('session_id, google_event_id, sessions!inner(debut, etablissement_id, statut)')
      .eq('provider', 'google_meet')
      .eq('sessions.etablissement_id', etablissementId)
      .eq('sessions.statut', 'planifiee')
      .gte('sessions.debut', maintenant)

    for (const visio of visios ?? []) {
      const lienVisio = creerLienJitsi()
      const { error } = await serviceClient
        .from('video_sessions')
        .update({ room_ref: lienVisio, provider: 'jitsi' })
        .eq('session_id', visio.session_id)
      if (error) {
        echecs.push({ table: 'video_sessions', id: visio.session_id, raison: error.message })
        continue
      }
      const calendrier = await poser(integration, visio.google_event_id, lienVisio)
      rapport.push({ table: 'video_sessions', id: visio.session_id, calendrier })
    }

    return Response.json({
      ok: echecs.length === 0,
      basculees: rapport.length,
      compteGoogleConnecte: Boolean(integration),
      rapport,
      echecs,
    })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Bascule impossible.' }, { status: 500 })
  }
}

/* Pose le lien sur l'événement Calendar, quand il y en a un : c'est ce qui prévient les
   participants. Une réunion sans événement Google (compte déconnecté au moment de sa création)
   bascule quand même en base — l'application y affichera le bon lien. */
async function poser(
  integration: IntegrationGoogle | null,
  eventId: string | null,
  lienVisio: string,
): Promise<'mis a jour' | 'non synchronise'> {
  if (!integration || !eventId) return 'non synchronise'
  return modifierEvenementVisio(integration, eventId, { lienVisio })
    .then(() => 'mis a jour' as const)
    .catch(() => 'non synchronise' as const)
}
