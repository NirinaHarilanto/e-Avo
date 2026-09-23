import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerSeanceAvecInscriptions } from '../_lib/creerSeance.js'

export const config = { runtime: 'edge' }

interface Corps {
  studentIds?: string[]
  teacherId?: string
  dureeMinutes?: number
  debuts?: string[]
  cohortId?: string
}

const MAX_OCCURRENCES = 156 // ~3 ans à raison de 2 séances/semaine — garde-fou anti-erreur de saisie

// Planning prévisionnel : l'admin planifie d'un coup toutes les séances à venir d'un forfait
// (individuel ou duo) — le tableau `debuts` (ISO, calculé côté client à partir d'une
// récurrence jour(s)/heure) est déjà résolu en dates concrètes, cet endpoint se contente de
// créer une séance par date via le même helper que `api/professeur/planifier-seance.ts`,
// pour ne pas dupliquer la logique d'inscription/visio.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.dureeMinutes || !body.debuts?.length) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }
    if (body.debuts.length > MAX_OCCURRENCES) {
      return Response.json({ error: `Trop de séances demandées (max ${MAX_OCCURRENCES}).` }, { status: 400 })
    }

    /* Vague : c'est elle qui définit la liste des élèves et le professeur, pas l'appelant — une
       vague se planifie d'un bloc (demande client du 2026-09-23, point 8). Les élèves sont
       relus ici pour que le planning couvre l'effectif réel au moment où on le crée. */
    let cohortId: string | null = null
    let studentIds = body.studentIds ?? []
    let teacherId = body.teacherId
    if (body.cohortId) {
      const { data: cohorte } = await serviceClient
        .from('cohorts')
        .select('id, etablissement_id, teacher_id')
        .eq('id', body.cohortId)
        .maybeSingle()
      if (!cohorte || cohorte.etablissement_id !== etablissementId) {
        return Response.json({ error: 'Vague invalide pour cet établissement.' }, { status: 400 })
      }
      const { data: inscrits } = await serviceClient
        .from('cohort_enrollments')
        .select('student_id')
        .eq('cohort_id', cohorte.id)
      studentIds = (inscrits ?? []).map((i: { student_id: string }) => i.student_id)
      if (studentIds.length === 0) {
        return Response.json({ error: 'Cette vague n’a encore aucun élève inscrit.' }, { status: 400 })
      }
      teacherId = teacherId ?? cohorte.teacher_id ?? undefined
      cohortId = cohorte.id
    }

    if (studentIds.length === 0 || !teacherId) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: teacher } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id')
      .eq('id', teacherId)
      .single()
    if (!teacher || teacher.role !== 'professeur' || teacher.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Professeur invalide pour cet établissement.' }, { status: 400 })
    }

    const { data: students } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id')
      .in('id', studentIds)
    const studentsValides = (students ?? []).filter(
      (s) => s.role === 'etudiant' && s.etablissement_id === etablissementId,
    )
    if (studentsValides.length !== studentIds.length) {
      return Response.json({ error: 'Un ou plusieurs étudiants sont invalides pour cet établissement.' }, { status: 400 })
    }

    const type = studentIds.length > 1 ? 'collectif' : 'individuel'
    const sessionIds: string[] = []
    for (const debut of body.debuts) {
      const resultat = await creerSeanceAvecInscriptions(serviceClient, {
        etablissementId,
        teacherId,
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
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
