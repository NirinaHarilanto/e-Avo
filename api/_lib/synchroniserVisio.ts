/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { deplacerEvenement, integrationDeLEtablissement, noterErreurGoogle, supprimerEvenement } from './google.js'
import { messageErreur } from './creerSeance.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/* Répercussions sur l'agenda Google d'un changement de séance. Comme à la création, une panne
   côté Google ne doit jamais empêcher l'opération métier d'aboutir en base : la séance est
   déplacée ou annulée dans e-Avo quoi qu'il arrive, l'incident est seulement noté. */

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

  try {
    const integration = await integrationDeLEtablissement(serviceClient, params.etablissementId)
    if (!integration) return
    // Le lien Meet est porté par l'événement : le déplacer plutôt que le recréer évite d'envoyer
    // aux élèves un second lien qui invaliderait celui déjà noté dans leur agenda.
    await deplacerEvenement(integration, video.google_event_id, params.debut, params.dureeMinutes)
    await noterErreurGoogle(serviceClient, params.etablissementId, null)
  } catch (error) {
    await noterErreurGoogle(serviceClient, params.etablissementId, messageErreur(error))
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
    try {
      const integration = await integrationDeLEtablissement(serviceClient, params.etablissementId)
      if (integration) {
        await supprimerEvenement(integration, video.google_event_id)
        await noterErreurGoogle(serviceClient, params.etablissementId, null)
      }
    } catch (error) {
      await noterErreurGoogle(serviceClient, params.etablissementId, messageErreur(error))
    }
  }

  await serviceClient.from('video_sessions').update({ statut: 'annulee' }).eq('session_id', params.sessionId)
}
