/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creerEvenementVisio, integrationDeLEtablissement, noterErreurGoogle } from './google.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

interface ParamsSeance {
  etablissementId: string
  teacherId: string
  type: 'individuel' | 'collectif'
  debut: string
  dureeMinutes: number
  studentIds: string[]
  /* Vague (promotion) à laquelle rattacher la séance (0069) — toujours renseigné dès que la
     séance vient d'une vague ou d'une de ses classes, y compris quand `cohortClassId` est posé
     (dérivé alors de `cohort_classes.cohort_id` par l'appelant) : la clôture et le décompte
     d'heures collectif (0069/0071) ne regardent que cette colonne. */
  cohortId?: string | null
  /* Classe de niveau au sein de la vague (0074) — présente seulement quand ce sont les inscrits
     de CETTE classe, et elle seule, qui sont dans `studentIds`. */
  cohortClassId?: string | null
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
  /* Les deux requêtes partent ensemble : la lecture des affectations ne dépend pas de la séance
     créée, seul l'insert des inscriptions a besoin des deux. Les enchaîner coûtait un
     aller-retour réseau de plus à chaque séance — multiplié par le nombre de dates lors d'une
     planification prévisionnelle, qui les crée en boucle. */
  const [creation, { data: affectations }] = await Promise.all([
    serviceClient
      .from('sessions')
      .insert({
        etablissement_id: params.etablissementId,
        teacher_id: params.teacherId,
        type: params.type,
        debut: params.debut,
        duree_minutes: params.dureeMinutes,
        statut: 'planifiee',
        cohort_id: params.cohortId ?? null,
        cohort_class_id: params.cohortClassId ?? null,
      })
      .select('id')
      .single(),
    serviceClient
      .from('teacher_assignments')
      .select('id, student_id')
      .eq('teacher_id', params.teacherId)
      .in('student_id', params.studentIds)
      .is('date_fin', null),
  ])

  const { data: session, error: sessionError } = creation
  if (sessionError || !session) {
    return { error: sessionError?.message ?? 'Échec de la création de la séance.' }
  }

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
  /* Les deux lectures partent ensemble : la liste des participants ne dépend pas du compte Google
     connecté. Elle est demandée même quand aucune intégration n'existe — un appel de plus dans ce
     cas, contre un aller-retour économisé dans le cas courant, où elle est toujours nécessaire. */
  const [resultatIntegration, resultatParticipants] = await Promise.allSettled([
    integrationDeLEtablissement(serviceClient, params.etablissementId),
    emailsParticipants(serviceClient, params.teacherId, params.studentIds),
  ])

  const integration = resultatIntegration.status === 'fulfilled' ? resultatIntegration.value : null
  const participants = resultatParticipants.status === 'fulfilled' ? resultatParticipants.value : null

  /* Un échec de l'une ou l'autre reste tracé dans `google_integrations.derniere_erreur`, d'où les
     paramètres l'affichent : une séance qui se retrouve sans lien ne doit jamais l'être en
     silence. */
  const panne = [resultatIntegration, resultatParticipants].find((r) => r.status === 'rejected')
  if (panne?.status === 'rejected') {
    await noterErreurGoogle(serviceClient, params.etablissementId, messageErreur(panne.reason))
  }

  if (integration && participants) {
    try {
      const { eventId, lienVisio } = await creerEvenementVisio(integration, {
        titre: participants.titreCours,
        description: 'Cours planifié depuis e-Avo.',
        debut: params.debut,
        dureeMinutes: params.dureeMinutes,
        emailsInvites: participants.emails,
      })
      await serviceClient.from('video_sessions').insert({
        session_id: params.sessionId,
        provider: 'jitsi',
        room_ref: lienVisio,
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
