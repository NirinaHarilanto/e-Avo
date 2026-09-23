/// <reference types="node" />
import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { integrationDeLEtablissement, supprimerEvenement } from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  evenementId?: string
}

/**
 * Annulation d'un événement « autre » créé par le professeur lui-même (voir creer-evenement.ts).
 * Restreint à son propre événement (`cree_par`) — contrairement à l'admin, qui peut annuler
 * n'importe quel rendez-vous de son établissement via api/admin/annuler-evenement.ts.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    if (!roles.includes('professeur')) {
      return Response.json({ error: 'Réservé à un professeur.' }, { status: 403 })
    }
    const corps = (await request.json()) as Corps
    if (!corps.evenementId) {
      return Response.json({ error: 'evenementId est requis.' }, { status: 400 })
    }

    const { data: evenement } = await serviceClient
      .from('evenements_admin')
      .select('id, etablissement_id, cree_par, google_event_id')
      .eq('id', corps.evenementId)
      .maybeSingle()
    if (!evenement || evenement.etablissement_id !== etablissementId || evenement.cree_par !== profileId) {
      return Response.json({ error: 'Événement introuvable.' }, { status: 404 })
    }

    if (evenement.google_event_id) {
      const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
      if (integration) {
        await supprimerEvenement(integration, evenement.google_event_id).catch(() => {})
      }
    }

    const { error } = await serviceClient.from('evenements_admin').update({ annule: true }).eq('id', evenement.id)
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (erreur) {
    if (erreur instanceof TeacherAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
