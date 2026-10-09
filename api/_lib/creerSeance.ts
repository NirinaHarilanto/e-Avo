/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creerEvenementVisio, integrationHoteReunion, noterErreurGoogle, noterErreurHote } from './google.js'

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
    type: params.type,
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
  /* Décide du fournisseur de visioconférence : Google Meet pour l'individuel et le duo, Jitsi
     pour le collectif (règle client du 2026-10-09, voir `FournisseurVisio` dans google.ts). Le
     duo n'est pas un type à part en base — c'est une séance `individuel` à deux inscrits — et
     suit donc naturellement la même branche. */
  type: 'individuel' | 'collectif'
}

/**
 * Crée la ligne `video_sessions` de la séance : un vrai lien Google Meet si un compte Google est
 * connecté, sinon le lien interne d'origine.
 *
 * L'événement naît dans l'agenda du PROFESSEUR de la séance dès qu'il a connecté son compte
 * (0107) : c'est lui l'organisateur, c'est son adresse qui invite les élèves, et l'admin n'est donc
 * plus destinataire d'office — exactement la règle client du 2026-10-09, y compris quand c'est
 * l'admin qui a cliqué « planifier ». Voir `integrationHoteReunion`, qui porte le choix de l'hôte
 * et son repli.
 *
 * Aucune erreur Google ne fait échouer la planification : le cours existe, c'est l'essentiel, et
 * l'admin peut générer le lien après coup (`api/admin/generer-lien-visio.ts`). L'incident est
 * conservé dans la colonne `derniere_erreur` de l'hôte concerné, pour être affiché dans son écran.
 */
export async function creerVisioconference(serviceClient: ServiceClient, params: ParamsVisio): Promise<void> {
  /* Les deux lectures partent ensemble : la liste des participants ne dépend pas du compte Google
     connecté. Elle est demandée même quand aucune intégration n'existe — un appel de plus dans ce
     cas, contre un aller-retour économisé dans le cas courant, où elle est toujours nécessaire. */
  const [resultatIntegration, resultatParticipants] = await Promise.allSettled([
    integrationHoteReunion(serviceClient, { organisateurId: params.teacherId, etablissementId: params.etablissementId }),
    emailsParticipants(serviceClient, params.teacherId, params.studentIds),
  ])

  const hote = resultatIntegration.status === 'fulfilled' ? resultatIntegration.value : null
  const participants = resultatParticipants.status === 'fulfilled' ? resultatParticipants.value : null

  /* Un échec de l'une ou l'autre reste tracé, d'où les écrans l'affichent : une séance qui se
     retrouve sans lien ne doit jamais l'être en silence. Noté sur l'établissement quand l'hôte
     n'a pas pu être déterminé — c'est le seul interlocuteur connu à ce stade. */
  const panne = [resultatIntegration, resultatParticipants].find((r) => r.status === 'rejected')
  if (panne?.status === 'rejected') {
    await noterErreurGoogle(serviceClient, params.etablissementId, messageErreur(panne.reason))
  }

  if (hote && participants) {
    try {
      const { eventId, lienVisio, fournisseur } = await creerEvenementVisio(hote, {
        titre: participants.titreCours,
        description: 'Cours planifié depuis Hari Online Club.',
        debut: params.debut,
        dureeMinutes: params.dureeMinutes,
        /* Le professeur est l'organisateur quand c'est son compte qui héberge : l'inviter en plus
           ferait apparaître son adresse deux fois sur la fiche Google. Les élèves, eux, sont
           toujours invités — ce sont eux qui doivent recevoir la convocation. */
        emailsInvites: participants.emails.filter((email) => email !== hote.googleEmail),
        fournisseur: params.type === 'collectif' ? 'jitsi' : 'google_meet',
      })
      await serviceClient.from('video_sessions').insert({
        session_id: params.sessionId,
        /* Le fournisseur VRAIMENT obtenu, pas celui demandé : `creerEvenementVisio` retombe sur
           Jitsi si Google refuse de créer la visio Meet. */
        provider: fournisseur,
        room_ref: lienVisio,
        statut: 'planifiee',
        google_event_id: eventId,
        /* Quel compte héberge réellement la réunion. Lu par l'admin dans « Séances & visio » pour
           savoir qui organise, et seule trace lisible du choix fait ici. */
        organisateur_email: hote.googleEmail,
      })
      await noterErreurHote(serviceClient, hote, null)
      return
    } catch (error) {
      await noterErreurHote(serviceClient, hote, messageErreur(error))
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
