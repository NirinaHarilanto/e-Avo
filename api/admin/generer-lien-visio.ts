import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerEvenementMeet, integrationDeLEtablissement, noterErreurGoogle } from '../_lib/google.js'
import { emailsParticipants, messageErreur } from '../_lib/creerSeance.js'

export const config = { runtime: 'edge' }

interface Corps {
  sessionId?: string
}

// Rattrapage : crée (ou recrée) le lien Google Meet d'une séance déjà planifiée. Sert aux
// séances créées AVANT la connexion du compte Google — elles portent encore le lien interne —
// et aux rares cas où Google a refusé la création au moment de la planification (l'incident est
// alors visible dans les paramètres). Contrairement à la création de séance, l'erreur remonte
// ici à l'écran : l'admin a cliqué exprès sur ce bouton, il doit savoir si ça a marché.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps
    if (!body.sessionId) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: session } = await serviceClient
      .from('sessions')
      .select('id, teacher_id, debut, duree_minutes, statut, etablissement_id')
      .eq('id', body.sessionId)
      .single()
    if (!session || session.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Séance introuvable.' }, { status: 404 })
    }
    if (session.statut !== 'planifiee') {
      return Response.json({ error: 'Seule une séance encore planifiée peut recevoir un lien.' }, { status: 409 })
    }

    const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
    if (!integration) {
      return Response.json(
        { error: "Aucun compte Google n'est connecté. Connectez-le dans Paramètres pour générer de vrais liens Meet." },
        { status: 409 },
      )
    }

    const { data: inscriptions } = await serviceClient
      .from('session_enrollments')
      .select('student_id')
      .eq('session_id', session.id)
    const studentIds = (inscriptions ?? []).map((i) => i.student_id)

    try {
      const participants = await emailsParticipants(serviceClient, session.teacher_id, studentIds)
      const { eventId, lienMeet } = await creerEvenementMeet(integration, {
        titre: participants.titreCours,
        description: 'Cours planifié depuis e-Avo.',
        debut: session.debut,
        dureeMinutes: session.duree_minutes,
        emailsInvites: participants.emails,
      })

      // upsert plutôt qu'insert : la séance a déjà une ligne visio (lien interne) dans
      // l'immense majorité des cas, c'est précisément celle qu'on remplace.
      const { error } = await serviceClient.from('video_sessions').upsert(
        {
          session_id: session.id,
          provider: 'google_meet',
          room_ref: lienMeet,
          statut: 'planifiee',
          google_event_id: eventId,
          organisateur_email: integration.googleEmail,
        },
        { onConflict: 'session_id' },
      )
      if (error) {
        return Response.json({ error: error.message }, { status: 500 })
      }

      await noterErreurGoogle(serviceClient, etablissementId, null)
      return Response.json({ lienMeet })
    } catch (error) {
      await noterErreurGoogle(serviceClient, etablissementId, messageErreur(error))
      return Response.json({ error: messageErreur(error) }, { status: 502 })
    }
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
