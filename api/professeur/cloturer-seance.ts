import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'

export const config = { runtime: 'edge' }

interface Presence {
  studentId: string
  present: boolean
  minutesConnecte?: number
}

interface Corps {
  sessionId?: string
  presences?: Presence[]
}

// Clôture d'une séance : bascule son statut à "terminee", enregistre la présence de chaque
// élève, puis écrit les écritures d'heures (crédit professeur, débit par élève présent).
// `hour_ledger` n'accepte aucun insert direct depuis le client (voir
// supabase/migrations/0011_hour_ledger.sql, commentaire) — cette clôture est le seul endroit
// où ces écritures sont créées, à partir d'un événement métier réel.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, role } = await requireTeacherOrAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.sessionId || !body.presences) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: session, error: sessionError } = await serviceClient
      .from('sessions')
      .select('*')
      .eq('id', body.sessionId)
      .single()

    if (sessionError || !session || session.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Séance introuvable.' }, { status: 404 })
    }
    if (role === 'professeur' && session.teacher_id !== profileId) {
      return Response.json({ error: "Cette séance n'est pas la vôtre." }, { status: 403 })
    }
    if (session.statut !== 'planifiee') {
      return Response.json({ error: 'Cette séance est déjà clôturée ou annulée.' }, { status: 409 })
    }

    for (const presence of body.presences) {
      const { error } = await serviceClient
        .from('session_enrollments')
        .update({ present: presence.present, minutes_connecte: presence.minutesConnecte ?? null })
        .eq('session_id', session.id)
        .eq('student_id', presence.studentId)
      if (error) {
        return Response.json({ error: error.message }, { status: 500 })
      }
    }

    const { error: statutError } = await serviceClient
      .from('sessions')
      .update({ statut: 'terminee' })
      .eq('id', session.id)
    if (statutError) {
      return Response.json({ error: statutError.message }, { status: 500 })
    }

    const heures = session.duree_minutes / 60
    const ecritures = [
      {
        etablissement_id: etablissementId,
        session_id: session.id,
        teacher_id: session.teacher_id,
        type_ecriture: 'credit_professeur' as const,
        heures,
      },
      ...body.presences
        .filter((p) => p.present)
        .map((p) => ({
          etablissement_id: etablissementId,
          session_id: session.id,
          student_id: p.studentId,
          type_ecriture: 'debit_etudiant' as const,
          heures,
        })),
    ]
    const { error: ledgerError } = await serviceClient.from('hour_ledger').insert(ecritures)
    if (ledgerError) {
      return Response.json({ error: ledgerError.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
