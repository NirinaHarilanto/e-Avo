import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { creerSeanceAvecInscriptions } from '../_lib/creerSeance.js'

export const config = { runtime: 'edge' }

interface Corps {
  studentIds?: string[]
  dureeMinutes?: number
  debuts?: string[]
  /* Planning d'une vague entière (0069) : les élèves sont alors ceux de la vague, et le
     professeur doit en être l'animateur. */
  cohortId?: string
}

const MAX_OCCURRENCES = 156 // même garde-fou que la version admin (~3 ans à 2 séances/semaine)

// Planning prévisionnel côté professeur : le pendant de
// `api/admin/planifier-seances-prevision.ts`, avec deux différences de portée qui sont tout
// l'intérêt de cette route séparée — le professeur planifie forcément POUR LUI-MÊME (aucun
// teacherId accepté dans le corps), et uniquement pour les élèves qui lui sont ACTUELLEMENT
// attribués (l'admin, lui, peut planifier pour n'importe quel élève de l'établissement).
// Un admin qui appellerait cette route reste traité comme un professeur : c'est la route admin
// qui porte les droits élargis.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireTeacherOrAdmin(request)
    const body = (await request.json()) as Corps

    if ((!body.studentIds?.length && !body.cohortId) || !body.dureeMinutes || !body.debuts?.length) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }
    if (body.debuts.length > MAX_OCCURRENCES) {
      return Response.json({ error: `Trop de séances demandées (max ${MAX_OCCURRENCES}).` }, { status: 400 })
    }
    if (body.dureeMinutes <= 0) {
      return Response.json({ error: 'Durée invalide.' }, { status: 400 })
    }
    if (body.debuts.some((debut) => Number.isNaN(new Date(debut).getTime()))) {
      return Response.json({ error: 'Une des dates est invalide.' }, { status: 400 })
    }

    /* Une vague se planifie d'un bloc, et le droit d'y toucher ne vient pas des affectations
       individuelles (un élève de vague n'a pas forcément de `teacher_assignments`) mais du fait
       d'en être l'animateur désigné — 0069, demande client du 2026-09-23 (point 8). */
    let cohortId: string | null = null
    let studentIds = body.studentIds ?? []
    if (body.cohortId) {
      const { data: cohorte } = await serviceClient
        .from('cohorts')
        .select('id, etablissement_id, teacher_id')
        .eq('id', body.cohortId)
        .maybeSingle()
      if (!cohorte || cohorte.etablissement_id !== etablissementId) {
        return Response.json({ error: 'Vague invalide pour cet établissement.' }, { status: 400 })
      }
      if (cohorte.teacher_id !== profileId) {
        return Response.json({ error: "Vous n'êtes pas le professeur de cette vague." }, { status: 403 })
      }
      const { data: inscrits } = await serviceClient
        .from('cohort_enrollments')
        .select('student_id')
        .eq('cohort_id', cohorte.id)
      studentIds = (inscrits ?? []).map((i: { student_id: string }) => i.student_id)
      if (studentIds.length === 0) {
        return Response.json({ error: 'Cette vague n’a encore aucun élève inscrit.' }, { status: 400 })
      }
      cohortId = cohorte.id
    } else {
      const { data: affectations } = await serviceClient
        .from('teacher_assignments')
        .select('student_id')
        .eq('teacher_id', profileId)
        .is('date_fin', null)
      const elevesAutorises = new Set((affectations ?? []).map((a) => a.student_id))

      const nonAutorises = studentIds.filter((id) => !elevesAutorises.has(id))
      if (nonAutorises.length > 0) {
        return Response.json(
          { error: "Vous ne pouvez planifier que pour les élèves qui vous sont actuellement attribués." },
          { status: 403 },
        )
      }
    }

    const type = studentIds.length > 1 ? 'collectif' : 'individuel'
    const sessionIds: string[] = []
    for (const debut of body.debuts) {
      const resultat = await creerSeanceAvecInscriptions(serviceClient, {
        etablissementId,
        teacherId: profileId,
        type,
        debut,
        dureeMinutes: body.dureeMinutes,
        studentIds,
        cohortId,
      })
      if ('error' in resultat) {
        return Response.json({ error: resultat.error, sessionsCreees: sessionIds.length }, { status: 500 })
      }
      sessionIds.push(resultat.sessionId)
    }

    return Response.json({ sessionIds })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
