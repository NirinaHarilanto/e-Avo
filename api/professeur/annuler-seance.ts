import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { annulerVisio } from '../_lib/synchroniserVisio.js'

export const config = { runtime: 'edge' }

interface Corps {
  sessionId?: string
}

// Annulation d'une séance. Le professeur pouvait déjà le faire directement depuis le navigateur
// (policy `sessions_teacher_all`, 0008), mais l'annulation doit maintenant faire disparaître
// aussi l'événement Google Calendar et prévenir les invités — ce qui exige le jeton de
// l'établissement, hors de portée du client. Le passage par cette fonction remplace donc
// l'update direct côté CalendrierProfesseur.tsx.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.sessionId) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: session, error: sessionError } = await serviceClient
      .from('sessions')
      .select('id, teacher_id, statut, etablissement_id')
      .eq('id', body.sessionId)
      .single()

    if (sessionError || !session || session.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Séance introuvable.' }, { status: 404 })
    }
    if (!roles.includes('admin_etablissement') && session.teacher_id !== profileId) {
      return Response.json({ error: "Cette séance n'est pas la vôtre." }, { status: 403 })
    }
    if (session.statut !== 'planifiee') {
      return Response.json({ error: 'Seule une séance encore planifiée peut être annulée.' }, { status: 409 })
    }

    const { error: updateError } = await serviceClient
      .from('sessions')
      .update({ statut: 'annulee' })
      .eq('id', session.id)
    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    await annulerVisio(serviceClient, { sessionId: session.id, etablissementId })

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
