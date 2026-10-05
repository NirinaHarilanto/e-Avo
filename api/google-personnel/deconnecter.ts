import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'

export const config = { runtime: 'edge' }

// Déconnexion du Google Calendar personnel (0098) : la ligne est supprimée, donc le jeton avec
// elle. Ne touche à rien côté Google (lecture seule depuis le départ) — la personne garde
// l'accès à ses propres événements Google ailleurs, seule la superposition dans HOC disparaît.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId } = await requireTeacherOrAdmin(request)
    const { error } = await serviceClient.from('google_integrations_personnelles').delete().eq('profile_id', profileId)
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
