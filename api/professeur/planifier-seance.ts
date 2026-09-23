import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { creerSeanceAvecInscriptions } from '../_lib/creerSeance.js'

export const config = { runtime: 'edge' }

interface Corps {
  teacherId?: string
  studentIds?: string[]
  type?: 'individuel' | 'collectif'
  debut?: string
  dureeMinutes?: number
  cohortId?: string
}

// Planification d'une séance. `session_enrollments` n'a aucune policy d'insert pour
// `professeur` (voir supabase/migrations/0009_session_enrollments.sql) : un professeur ne
// peut donc pas s'auto-inscrire des élèves côté client, cette fonction le fait pour lui après
// vérification. Un stub `video_sessions` est créé en même temps (provider "stub", lien
// factice tant que le vrai prestataire de visioconférence n'est pas choisi).
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.studentIds?.length || !body.type || !body.debut || !body.dureeMinutes) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    // Piloté par la forme de la requête plutôt que par une priorité de rôle arbitraire : un
    // compte qui cumule les deux capacités (admin plateforme, voir teacherAuth.ts) peut aussi
    // bien planifier pour un autre professeur (teacherId fourni) que pour lui-même (omis).
    let teacherId = profileId
    if (body.teacherId) {
      if (!roles.includes('admin_etablissement')) {
        return Response.json({ error: 'Réservé à un administrateur.' }, { status: 403 })
      }
      const { data: teacherProfile } = await serviceClient
        .from('profiles')
        .select('id, role, etablissement_id')
        .eq('id', body.teacherId)
        .single()
      if (!teacherProfile || teacherProfile.role !== 'professeur' || teacherProfile.etablissement_id !== etablissementId) {
        return Response.json({ error: 'Professeur invalide pour cet établissement.' }, { status: 400 })
      }
      teacherId = teacherProfile.id
    } else if (!roles.includes('professeur')) {
      return Response.json({ error: 'teacherId requis pour un administrateur.' }, { status: 400 })
    }

    const { data: students } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id')
      .in('id', body.studentIds)
    const studentsValides = (students ?? []).filter(
      (s) => s.role === 'etudiant' && s.etablissement_id === etablissementId,
    )
    if (studentsValides.length !== body.studentIds.length) {
      return Response.json({ error: 'Un ou plusieurs étudiants sont invalides pour cet établissement.' }, { status: 400 })
    }

    /* Une vague ne se rattache pas sur parole : c'est ce lien qui fera décompter l'heure à tous
       ses inscrits à la clôture (point 10), il doit donc désigner une vague réelle du même
       établissement. */
    let cohortId: string | null = null
    if (body.cohortId) {
      const { data: cohorte } = await serviceClient
        .from('cohorts')
        .select('id, etablissement_id')
        .eq('id', body.cohortId)
        .maybeSingle()
      if (!cohorte || cohorte.etablissement_id !== etablissementId) {
        return Response.json({ error: 'Vague invalide pour cet établissement.' }, { status: 400 })
      }
      cohortId = cohorte.id
    }

    const resultat = await creerSeanceAvecInscriptions(serviceClient, {
      etablissementId,
      teacherId,
      type: body.type,
      debut: body.debut,
      dureeMinutes: body.dureeMinutes,
      studentIds: body.studentIds,
      cohortId,
    })
    if ('error' in resultat) {
      return Response.json({ error: resultat.error }, { status: 500 })
    }

    return Response.json({ sessionId: resultat.sessionId })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
