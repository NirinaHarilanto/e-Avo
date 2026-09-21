import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { annulerVisio } from '../_lib/synchroniserVisio.js'
import { notifierParticipantsSeance } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  sessionId?: string
}

// Annulation d'une séance. Le professeur pouvait déjà le faire directement depuis le navigateur
// (policy `sessions_teacher_all`, 0008), mais l'annulation doit maintenant faire disparaître
// aussi l'événement Google Calendar et prévenir les invités — ce qui exige le jeton de
// l'établissement, hors de portée du client. Le passage par cette fonction remplace donc
// l'update direct côté CalendrierProfesseur.tsx. Trace désormais l'annulation dans
// session_modifications et prévient les personnes concernées (demande client du 2026-09-17,
// même traçabilité que pour une reprogrammation — voir modifier-seance.ts).
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
      .select('id, teacher_id, statut, etablissement_id, debut, duree_minutes')
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

    await serviceClient.from('session_modifications').insert({
      session_id: session.id,
      etablissement_id: etablissementId,
      modifie_par: profileId,
      type_modification: 'annulee',
      ancien_debut: session.debut,
      ancienne_duree_minutes: session.duree_minutes,
    })

    await annulerVisio(serviceClient, { sessionId: session.id, etablissementId })

    await notifierParticipantsSeance(serviceClient, {
      etablissementId,
      sessionId: session.id,
      teacherId: session.teacher_id,
      acteurId: profileId,
      type: 'seance_annulee',
      titre: 'Séance annulée',
      message: `La séance du ${new Date(session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} a été annulée.`,
    })

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
