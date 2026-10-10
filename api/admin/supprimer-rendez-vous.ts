/// <reference types="node" />
import { AdminAuthError, requireAdmin } from '../_lib/adminAuth.js'
import { integrationDeLEtablissement, supprimerEvenement } from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  rendezVousId?: string
}

/**
 * Suppression DÉFINITIVE d'un rendez-vous prospect déjà clos — demande client du 2026-10-10 :
 * « il faut que l'admin puisse tout faire sur son agenda (ajouter, modifier, supprimer, annuler)
 * sur tout type de rendez-vous ». Un rendez-vous `refuse` ou `annule` n'avait jusqu'ici plus
 * aucune action possible dans sa fiche : ni le reprogrammer, ni l'effacer de l'agenda.
 *
 * Restreinte aux statuts `refuse`/`annule` : un rendez-vous encore actif (`en_attente`,
 * `confirme`) doit TOUJOURS passer par `annuler-rendez-vous.ts` avant de pouvoir être supprimé,
 * jamais par ce raccourci — c'est cette route-là qui prévient le prospect par e-mail et retire
 * l'événement Google. Contourner cette étape laisserait un rendez-vous disparaître de HOC sans
 * que personne n'en soit informé.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.rendezVousId) {
      return Response.json({ error: 'rendezVousId est requis.' }, { status: 400 })
    }

    const { data: rendezVous } = await serviceClient
      .from('rendez_vous')
      .select('id, etablissement_id, statut, google_event_id')
      .eq('id', corps.rendezVousId)
      .maybeSingle()
    if (!rendezVous || rendezVous.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Rendez-vous introuvable.' }, { status: 404 })
    }
    if (rendezVous.statut !== 'refuse' && rendezVous.statut !== 'annule') {
      return Response.json({ error: 'Annulez d’abord ce rendez-vous avant de le supprimer.' }, { status: 409 })
    }

    // Best effort, défensif : un rendez-vous refusé/annulé n'a normalement plus d'événement
    // Google (annuler-rendez-vous.ts le retire déjà), mais un refus traité avant ce mécanisme
    // peut en avoir laissé un.
    if (rendezVous.google_event_id) {
      const integration = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)
      if (integration) {
        await supprimerEvenement(integration, rendezVous.google_event_id).catch(() => {})
      }
    }

    const { error } = await serviceClient.from('rendez_vous').delete().eq('id', rendezVous.id)
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
