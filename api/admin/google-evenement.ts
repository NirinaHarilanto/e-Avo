import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { integrationDeLEtablissement, modifierEvenementVisio, supprimerEvenement, GoogleError } from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  eventId?: string
  action?: 'modifier' | 'supprimer'
  titre?: string
  description?: string
  debut?: string
  dureeMinutes?: number
}

/**
 * Modifie ou supprime, dans l'agenda Google de l'établissement, un événement qui n'a PAS de
 * contrepartie dans HOC — typiquement un rendez-vous que l'admin a créé depuis Google Agenda et
 * que HOC affiche en superposition (voir api/google-personnel/evenements.ts).
 *
 * Demande client du 2026-10-09 : « on doit pouvoir voir, modifier, supprimer, ajouter un événement
 * depuis l'agenda de l'admin dans l'application HOC et les mises [à jour] se feront
 * instantanément sur l'agenda du compte Google ». Les événements qui viennent de HOC, eux, gardent
 * leurs propres écrans : les modifier ici court-circuiterait la base, qui est leur source de
 * vérité. C'est aussi pourquoi cette route refuse tout identifiant déjà rattaché à une ligne HOC —
 * un garde-fou, pas une simple convention d'appel.
 *
 * Réservée à l'administrateur : l'agenda de l'établissement n'est pas celui d'un professeur, et
 * les agendas Google PERSONNELS restent en lecture seule (scope `calendar.readonly`, 0098).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    const eventId = corps.eventId?.trim()
    if (!eventId || (corps.action !== 'modifier' && corps.action !== 'supprimer')) {
      return Response.json({ error: 'Requête incomplète.' }, { status: 400 })
    }

    if (await appartientAHOC(serviceClient, etablissementId, eventId)) {
      return Response.json(
        { error: 'Cet événement vient de Hari Online Club : modifiez-le depuis sa propre fiche, pas depuis l’agenda Google.' },
        { status: 409 },
      )
    }

    const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
    if (!integration) {
      return Response.json({ error: "Aucun compte Google n'est connecté." }, { status: 409 })
    }

    if (corps.action === 'supprimer') {
      await supprimerEvenement(integration, eventId)
      return Response.json({ ok: true })
    }

    if (!corps.titre?.trim()) {
      return Response.json({ error: 'Le titre est obligatoire.' }, { status: 400 })
    }
    if (corps.debut !== undefined && Number.isNaN(new Date(corps.debut).getTime())) {
      return Response.json({ error: 'Date invalide.' }, { status: 400 })
    }

    await modifierEvenementVisio(integration, eventId, {
      titre: corps.titre.trim(),
      description: corps.description?.trim() || undefined,
      debut: corps.debut,
      dureeMinutes: corps.dureeMinutes,
    })
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof GoogleError) {
      return Response.json({ error: error.message }, { status: 502 })
    }
    return Response.json({ error: 'Opération impossible.' }, { status: 500 })
  }
}

/* Un identifiant d'événement Google référencé par une ligne HOC appartient à une séance, un
   rendez-vous ou un événement d'agenda : il a son propre écran, avec ses règles (notifications,
   traçabilité, heures décomptées). Le toucher par ce raccourci laisserait la base et Google
   désaccordés. */
async function appartientAHOC(
  serviceClient: Parameters<typeof integrationDeLEtablissement>[0],
  etablissementId: string,
  eventId: string,
): Promise<boolean> {
  const [rdv, evenements, creneaux, visios] = await Promise.all([
    serviceClient.from('rendez_vous').select('id').eq('etablissement_id', etablissementId).eq('google_event_id', eventId).limit(1),
    serviceClient.from('evenements_admin').select('id').eq('etablissement_id', etablissementId).eq('google_event_id', eventId).limit(1),
    serviceClient
      .from('creneaux_test_positionnement')
      .select('id')
      .eq('etablissement_id', etablissementId)
      .eq('google_event_id', eventId)
      .limit(1),
    serviceClient.from('video_sessions').select('session_id').eq('google_event_id', eventId).limit(1),
  ])
  return [rdv.data, evenements.data, creneaux.data, visios.data].some((lot) => (lot ?? []).length > 0)
}
