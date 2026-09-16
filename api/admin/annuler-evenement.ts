/// <reference types="node" />
import { AdminAuthError, requireAdmin } from '../_lib/adminAuth.js'
import { integrationDeLEtablissement, supprimerEvenement } from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  evenementId?: string
}

/**
 * Annulation d'un événement créé par l'admin (voir creer-evenement.ts). Passe par le serveur
 * plutôt qu'une simple mise à jour cliente pour aussi supprimer l'événement Google Calendar
 * correspondant, quand il existe — le laisser trainer dans l'agenda de l'établissement une fois
 * l'événement annulé côté application aurait été trompeur pour les participants invités.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.evenementId) {
      return Response.json({ error: 'evenementId est requis.' }, { status: 400 })
    }

    const { data: evenement } = await serviceClient
      .from('evenements_admin')
      .select('id, etablissement_id, google_event_id')
      .eq('id', corps.evenementId)
      .maybeSingle()
    if (!evenement || evenement.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Événement introuvable.' }, { status: 404 })
    }

    if (evenement.google_event_id) {
      const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
      if (integration) {
        // Best effort : l'événement Google n'existe peut-être déjà plus (supprimé à la main),
        // ce qui ne doit pas empêcher l'annulation côté application.
        await supprimerEvenement(integration, evenement.google_event_id).catch(() => {})
      }
    }

    const { error } = await serviceClient.from('evenements_admin').update({ annule: true }).eq('id', evenement.id)
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
