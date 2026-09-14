/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creerEvenementMeet, integrationDeLEtablissement, noterErreurGoogle } from './google.js'

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
 * Crée une séance + ses inscriptions + sa visioconférence — logique partagée par
 * `api/professeur/planifier-seance.ts` (une séance à la fois),
 * `api/admin/planifier-seances-prevision.ts` et `api/professeur/planifier-seances-prevision.ts`
 * (planning prévisionnel, en boucle). Centralisée ici pour ne jamais désynchroniser ces
 * chemins : `session_enrollments` n'a aucune policy d'insert pour `professeur` (0009), donc ce
 * code tourne toujours derrière service_role.
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

  await creerVisioconference(serviceClient, {
    sessionId: session.id,
    etablissementId: params.etablissementId,
    teacherId: params.teacherId,
    studentIds: params.studentIds,
    debut: params.debut,
    dureeMinutes: params.dureeMinutes,
  })

  return { sessionId: session.id }
}

interface ParamsVisio {
  sessionId: string
  etablissementId: string
  teacherId: string
  studentIds: string[]
  debut: string
  dureeMinutes: number
}

/**
 * Crée la ligne `video_sessions` de la séance : un vrai lien Google Meet si l'établissement a
 * connecté son compte Google, sinon le lien interne d'origine.
 *
 * Aucune erreur Google ne fait échouer la planification : le cours existe, c'est l'essentiel, et
 * l'admin peut générer le lien après coup (`api/admin/generer-lien-visio.ts`). L'incident est
 * conservé dans `google_integrations.derniere_erreur` pour être affiché dans les paramètres.
 */
export async function creerVisioconference(serviceClient: ServiceClient, params: ParamsVisio): Promise<void> {
  let integration = null
  try {
    integration = await integrationDeLEtablissement(serviceClient, params.etablissementId)
  } catch (error) {
    await noterErreurGoogle(serviceClient, params.etablissementId, messageErreur(error))
  }

  if (integration) {
    try {
      const participants = await emailsParticipants(serviceClient, params.teacherId, params.studentIds)
      const { eventId, lienMeet } = await creerEvenementMeet(integration, {
        titre: participants.titreCours,
        description: 'Cours planifié depuis e-Avo.',
        debut: params.debut,
        dureeMinutes: params.dureeMinutes,
        emailsInvites: participants.emails,
      })
      await serviceClient.from('video_sessions').insert({
        session_id: params.sessionId,
        provider: 'google_meet',
        room_ref: lienMeet,
        statut: 'planifiee',
        google_event_id: eventId,
        organisateur_email: integration.googleEmail,
      })
      await noterErreurGoogle(serviceClient, params.etablissementId, null)
      return
    } catch (error) {
      await noterErreurGoogle(serviceClient, params.etablissementId, messageErreur(error))
    }
  }

  await serviceClient.from('video_sessions').insert({
    session_id: params.sessionId,
    provider: 'stub',
    room_ref: params.sessionId,
    statut: 'planifiee',
  })
}

export function messageErreur(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur Google inconnue.'
}

export async function emailsParticipants(
  serviceClient: ServiceClient,
  teacherId: string,
  studentIds: string[],
): Promise<{ emails: string[]; titreCours: string }> {
  const { data: profils } = await serviceClient
    .from('profiles')
    .select('id, nom, prenom, email')
    .in('id', [teacherId, ...studentIds])

  const professeur = (profils ?? []).find((p) => p.id === teacherId)
  const eleves = studentIds
    .map((id) => (profils ?? []).find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  const nomsEleves = eleves.map((e) => `${e.prenom ?? ''} ${e.nom ?? ''}`.trim()).filter(Boolean)
  const nomProfesseur = professeur ? `${professeur.prenom ?? ''} ${professeur.nom ?? ''}`.trim() : ''

  return {
    emails: [professeur?.email, ...eleves.map((e) => e.email)].filter((e): e is string => Boolean(e)),
    titreCours: `Cours${nomsEleves.length ? ` · ${nomsEleves.join(', ')}` : ''}${nomProfesseur ? ` · ${nomProfesseur}` : ''}`,
  }
}
