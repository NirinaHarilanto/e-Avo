/// <reference types="node" />
import { AdminAuthError, requireAdmin } from '../_lib/adminAuth.js'
import { integrationDeLEtablissement, supprimerEvenement } from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  evenementId?: string
}

/**
 * Suppression DÉFINITIVE d'un événement d'agenda admin déjà annulé — demande client du
 * 2026-10-10, même raison que supprimer-rendez-vous.ts : un événement `annule` restait sans
 * aucune action possible dans sa fiche.
 *
 * Restreinte aux événements déjà `annule` : un événement encore actif doit passer par
 * `annuler-evenement.ts`, qui prévient ses participants et retire l'événement Google — jamais
 * directement supprimé pendant qu'il est encore actif.
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
      .select('id, etablissement_id, annule, google_event_id')
      .eq('id', corps.evenementId)
      .maybeSingle()
    if (!evenement || evenement.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Événement introuvable.' }, { status: 404 })
    }
    if (!evenement.annule) {
      return Response.json({ error: 'Annulez d’abord cet événement avant de le supprimer.' }, { status: 409 })
    }

    // Best effort, défensif : annuler-evenement.ts retire déjà l'événement Google, un lien
    // orphelin ne doit cependant jamais bloquer la suppression de la ligne HOC.
    if (evenement.google_event_id) {
      const integration = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)
      if (integration) {
        await supprimerEvenement(integration, evenement.google_event_id).catch(() => {})
      }
    }

    const { error } = await serviceClient.from('evenements_admin').delete().eq('id', evenement.id)
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
