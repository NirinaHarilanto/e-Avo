/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import {
  deplacerEvenement,
  integrationHoteDeLaSession,
  modifierEvenementVisio,
  noterErreurGoogle,
  noterErreurHote,
  supprimerEvenement,
} from './google.js'
import { emailsParticipants, messageErreur } from './creerSeance.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/* Répercussions sur l'agenda Google d'un changement de séance. Comme à la création, une panne
   côté Google ne doit jamais empêcher l'opération métier d'aboutir en base : la séance est
   déplacée ou annulée dans HOC quoi qu'il arrive, l'incident est seulement noté.

   L'événement est visé avec le jeton du compte qui l'HÉBERGE — celui du professeur de la séance
   depuis 0107, et non plus systématiquement celui de l'établissement. Se tromper de compte donne
   un 404 que Google ne distingue pas d'un événement supprimé : la séance semblerait déplacée côté
   HOC alors qu'elle resterait à son ancienne heure dans l'agenda du professeur et de ses élèves. */

export async function deplacerVisio(
  serviceClient: ServiceClient,
  params: { sessionId: string; etablissementId: string; debut: string; dureeMinutes: number },
): Promise<void> {
  const { data: video } = await serviceClient
    .from('video_sessions')
    .select('google_event_id')
    .eq('session_id', params.sessionId)
    .maybeSingle()
  if (!video?.google_event_id) return

  let hote: Awaited<ReturnType<typeof integrationHoteDeLaSession>> = null
  try {
    hote = await integrationHoteDeLaSession(serviceClient, params.sessionId, params.etablissementId)
    if (!hote) return
    // Le lien Meet est porté par l'événement : le déplacer plutôt que le recréer évite d'envoyer
    // aux élèves un second lien qui invaliderait celui déjà noté dans leur agenda.
    await deplacerEvenement(hote, video.google_event_id, params.debut, params.dureeMinutes)
    await noterErreurHote(serviceClient, hote, null)
  } catch (error) {
    if (hote) await noterErreurHote(serviceClient, hote, messageErreur(error))
    else await noterErreurGoogle(serviceClient, params.etablissementId, messageErreur(error))
  }
}

/**
 * Réaligne la liste des invités de la réunion sur les inscrits actuels de la séance.
 *
 * L'événement est MODIFIÉ, jamais recréé : le lien Meet déjà noté dans l'agenda des participants
 * reste valable, et Google se charge d'envoyer l'invitation aux nouveaux venus.
 *
 * Né du binôme DUO (2026-10-11) : les deux membres sont désormais inscrits à la séance et conviés
 * dès la création, mais les réunions créées AVANT ce changement ne portent toujours qu'un seul
 * invité. Rien dans `deplacerVisio` ne touchait aux invités — seul l'horaire était synchronisé —
 * donc même en modifiant la séance, le second membre n'était jamais ajouté.
 *
 * Best effort, comme tout ce fichier : un incident Google est noté, jamais remonté en erreur.
 */
export async function synchroniserInvitesVisio(
  serviceClient: ServiceClient,
  params: { sessionId: string; etablissementId: string },
): Promise<void> {
  const { data: video } = await serviceClient
    .from('video_sessions')
    .select('google_event_id, room_ref')
    .eq('session_id', params.sessionId)
    .maybeSingle()
  if (!video?.google_event_id) return

  const { data: seance } = await serviceClient
    .from('sessions')
    .select('teacher_id')
    .eq('id', params.sessionId)
    .maybeSingle()
  if (!seance) return

  const { data: inscrits } = await serviceClient
    .from('session_enrollments')
    .select('student_id')
    .eq('session_id', params.sessionId)

  let hote: Awaited<ReturnType<typeof integrationHoteDeLaSession>> = null
  try {
    hote = await integrationHoteDeLaSession(serviceClient, params.sessionId, params.etablissementId)
    if (!hote) return
    const participants = await emailsParticipants(
      serviceClient,
      seance.teacher_id,
      (inscrits ?? []).map((i) => i.student_id),
    )
    await modifierEvenementVisio(hote, video.google_event_id, {
      // L'organisateur ne s'invite pas lui-même — voir creerVisioconference.
      emailsInvites: participants.emails.filter((email) => email !== hote!.googleEmail),
      titre: participants.titreCours,
      lienVisio: video.room_ref ?? undefined,
    })
    await noterErreurHote(serviceClient, hote, null)
  } catch (error) {
    if (hote) await noterErreurHote(serviceClient, hote, messageErreur(error))
    else await noterErreurGoogle(serviceClient, params.etablissementId, messageErreur(error))
  }
}

export async function annulerVisio(
  serviceClient: ServiceClient,
  params: { sessionId: string; etablissementId: string },
): Promise<void> {
  const { data: video } = await serviceClient
    .from('video_sessions')
    .select('google_event_id')
    .eq('session_id', params.sessionId)
    .maybeSingle()

  if (video?.google_event_id) {
    let hote: Awaited<ReturnType<typeof integrationHoteDeLaSession>> = null
    try {
      hote = await integrationHoteDeLaSession(serviceClient, params.sessionId, params.etablissementId)
      if (hote) {
        await supprimerEvenement(hote, video.google_event_id)
        await noterErreurHote(serviceClient, hote, null)
      }
    } catch (error) {
      if (hote) await noterErreurHote(serviceClient, hote, messageErreur(error))
      else await noterErreurGoogle(serviceClient, params.etablissementId, messageErreur(error))
    }
  }

  await serviceClient.from('video_sessions').update({ statut: 'annulee' }).eq('session_id', params.sessionId)
}
