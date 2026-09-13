/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

interface ParamsSeance {
  etablissementId: string
  teacherId: string
  type: 'individuel' | 'collectif'
  debut: string
  dureeMinutes: number
  studentIds: string[]
}

/**
 * Crée une séance + ses inscriptions + son stub visio — logique partagée par
 * `api/professeur/planifier-seance.ts` (une séance à la fois) et
 * `api/admin/planifier-seances-prevision.ts` (planning prévisionnel, en boucle). Centralisée
 * ici pour ne jamais désynchroniser les deux : `session_enrollments` n'a aucune policy
 * d'insert pour `professeur` (0009), donc ce code tourne toujours derrière service_role.
 */
export async function creerSeanceAvecInscriptions(
  serviceClient: ServiceClient,
  params: ParamsSeance,
): Promise<{ sessionId: string } | { error: string }> {
  const { data: session, error: sessionError } = await serviceClient
    .from('sessions')
    .insert({
      etablissement_id: params.etablissementId,
      teacher_id: params.teacherId,
      type: params.type,
      debut: params.debut,
      duree_minutes: params.dureeMinutes,
      statut: 'planifiee',
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    return { error: sessionError?.message ?? 'Échec de la création de la séance.' }
  }

  const { data: affectations } = await serviceClient
    .from('teacher_assignments')
    .select('id, student_id')
    .eq('teacher_id', params.teacherId)
    .in('student_id', params.studentIds)
    .is('date_fin', null)
  const affectationParEtudiant = new Map((affectations ?? []).map((a) => [a.student_id, a.id]))

  const { error: enrollError } = await serviceClient.from('session_enrollments').insert(
    params.studentIds.map((studentId) => ({
      session_id: session.id,
      student_id: studentId,
      teacher_assignment_id: affectationParEtudiant.get(studentId) ?? null,
      invitation_statut: 'en_attente' as const,
    })),
  )
  if (enrollError) {
    return { error: enrollError.message }
  }

  await serviceClient.from('video_sessions').insert({
    session_id: session.id,
    provider: 'stub',
    room_ref: session.id,
    statut: 'planifiee',
  })

  return { sessionId: session.id }
}
