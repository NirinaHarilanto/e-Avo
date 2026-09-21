import { AdminAuthError, requireAdmin } from '../_lib/adminAuth.js'
import { integrationDeLEtablissement, supprimerEvenement } from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  creneauId?: string
}

/**
 * Suppression d'une session de test oral. Passe par le serveur (comme annuler-evenement.ts)
 * pour aussi retirer l'événement Google Calendar correspondant — le laisser trainer dans
 * l'agenda de l'établissement une fois la session supprimée côté application serait trompeur.
 * Les inscriptions déjà enregistrées disparaissent avec elle (on delete cascade, 0051) ; les
 * prospects déjà convertis en étudiant ne sont pas affectés, la conversion est indépendante.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.creneauId) {
      return Response.json({ error: 'creneauId est requis.' }, { status: 400 })
    }

    const { data: creneau } = await serviceClient
      .from('creneaux_test_positionnement')
      .select('id, etablissement_id, google_event_id')
      .eq('id', corps.creneauId)
      .maybeSingle()
    if (!creneau || creneau.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Session introuvable.' }, { status: 404 })
    }

    if (creneau.google_event_id) {
      const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
      if (integration) {
        await supprimerEvenement(integration, creneau.google_event_id).catch(() => {})
      }
    }

    const { error } = await serviceClient.from('creneaux_test_positionnement').delete().eq('id', creneau.id)
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
