import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { annulerUneSeance } from '../_lib/annulerSeance.js'
import { formaterDateSeance, notifierAdminsMouvementPlanning, notifierParticipantsSeance } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  sessionId?: string
  /* Portée d'une séance faisant partie d'une série (0123, `serie_id`) — demande client du
     2026-10-12 : « il faut lui demander si cela concerne uniquement le rendez-vous ou la série ».
     Absent/'occurrence' : seule la séance visée. 'serie' : toutes les séances encore planifiées
     de la même série. */
  portee?: 'occurrence' | 'serie'
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
      .select('id, teacher_id, statut, etablissement_id, debut, duree_minutes, serie_id')
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
    if (body.portee === 'serie' && !session.serie_id) {
      return Response.json({ error: "Cette séance ne fait pas partie d'une série." }, { status: 400 })
    }

    /* « Toute la série » (0123) : toutes les séances ENCORE PLANIFIÉES de la même série, la
       séance cliquée comprise — jamais celles déjà terminées ou déjà annulées, exactement la
       même garantie que le garde-fou ci-dessus appliqué séance par séance. Une séance passée ne
       se détricote pas rétroactivement : ses heures sont déjà décomptées. */
    const sessionsAAnnuler =
      body.portee === 'serie' && session.serie_id
        ? (
            await serviceClient
              .from('sessions')
              .select('id, teacher_id, statut, etablissement_id, debut, duree_minutes')
              .eq('serie_id', session.serie_id)
              .eq('statut', 'planifiee')
          ).data ?? [session]
        : [session]

    const estAdmin = roles.includes('admin_etablissement')
    for (const s of sessionsAAnnuler) {
      await annulerUneSeance(serviceClient, s, profileId, etablissementId, estAdmin)
    }

    const estSerie = sessionsAAnnuler.length > 1
    await notifierParticipantsSeance(serviceClient, {
      etablissementId,
      sessionId: session.id,
      teacherId: session.teacher_id,
      acteurId: profileId,
      type: 'seance_annulee',
      titre: estSerie ? 'Série de séances annulée' : 'Séance annulée',
      message: estSerie
        ? `${sessionsAAnnuler.length} séances de la série ont été annulées, à partir du ${formaterDateSeance(session.debut)}.`
        : `La séance du ${formaterDateSeance(session.debut)} a été annulée.`,
    })

    const { data: inscrits } = await serviceClient.from('session_enrollments').select('student_id').eq('session_id', session.id)
    await notifierAdminsMouvementPlanning(serviceClient, {
      etablissementId,
      acteurId: profileId,
      teacherId: session.teacher_id,
      type: 'planning_seance_annulee',
      titre: estSerie ? 'Série de séances annulée' : 'Séance annulée',
      detail: estSerie
        ? `${sessionsAAnnuler.length} séances de la série ont été annulées, à partir du ${formaterDateSeance(session.debut)}.`
        : `La séance du ${formaterDateSeance(session.debut)} a été annulée.`,
      studentIds: (inscrits ?? []).map((i) => i.student_id),
    })

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
