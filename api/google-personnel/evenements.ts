import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { integrationPersonnelleDeLaPersonne, evenementsPersonnels, noterErreurGooglePersonnelle, GoogleError } from '../_lib/google.js'

export const config = { runtime: 'edge' }

/**
 * Événements du Google Calendar personnel de l'appelant, pour la fenêtre `debut`/`fin` demandée
 * (0098) — superposés en lecture seule dans son agenda HOC. Jamais d'erreur bloquante : une
 * personne qui n'a rien connecté reçoit simplement une liste vide (c'est l'état normal), et un
 * incident Google (jeton expiré, accès révoqué) renvoie aussi une liste vide plutôt que de casser
 * l'affichage de l'agenda HOC — seule la superposition manque, la trace de l'incident est notée
 * pour l'écran de connexion (Mon profil), comme pour l'intégration d'établissement.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId } = await requireTeacherOrAdmin(request)
    const url = new URL(request.url)
    const debutParam = url.searchParams.get('debut')
    const finParam = url.searchParams.get('fin')
    if (!debutParam || !finParam) {
      return Response.json({ error: 'Fenêtre de dates manquante.' }, { status: 400 })
    }
    const debut = new Date(debutParam)
    const fin = new Date(finParam)
    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
      return Response.json({ error: 'Fenêtre de dates invalide.' }, { status: 400 })
    }

    const integration = await integrationPersonnelleDeLaPersonne(serviceClient, profileId)
    if (!integration) {
      return Response.json({ evenements: [] })
    }

    try {
      const evenements = await evenementsPersonnels(integration, debut, fin)
      await noterErreurGooglePersonnelle(serviceClient, profileId, null)
      return Response.json({ evenements })
    } catch (erreurGoogle) {
      await noterErreurGooglePersonnelle(
        serviceClient,
        profileId,
        erreurGoogle instanceof Error ? erreurGoogle.message : 'Lecture de l’agenda personnel impossible.',
      )
      return Response.json({ evenements: [] })
    }
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof GoogleError) {
      return Response.json({ evenements: [] })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
