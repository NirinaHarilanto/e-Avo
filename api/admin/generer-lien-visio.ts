import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerEvenementVisio, integrationHoteReunion, noterErreurHote } from '../_lib/google.js'
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
      .select('id, teacher_id, debut, duree_minutes, statut, etablissement_id, type')
      .eq('id', body.sessionId)
      .single()
    if (!session || session.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Séance introuvable.' }, { status: 404 })
    }
    if (session.statut !== 'planifiee') {
      return Response.json({ error: 'Seule une séance encore planifiée peut recevoir un lien.' }, { status: 409 })
    }

    /* Hôte = le professeur de la séance dès qu'il a connecté son compte (0107), même si c'est
       l'admin qui déclenche ce rattrapage : le lien doit venir du compte qui donnera le cours. */
    const hote = await integrationHoteReunion(serviceClient, {
      organisateurId: session.teacher_id,
      etablissementId,
    })
    if (!hote) {
      return Response.json(
        { error: "Aucun compte Google n'est connecté. Connectez celui de l'établissement dans Paramètres, ou demandez au professeur de connecter le sien, pour générer de vrais liens Meet." },
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
      const { eventId, lienVisio, fournisseur } = await creerEvenementVisio(hote, {
        titre: participants.titreCours,
        description: 'Cours planifié depuis Hari Online Club.',
        debut: session.debut,
        dureeMinutes: session.duree_minutes,
        // L'organisateur n'a pas à s'inviter lui-même — voir creerVisioconference.
        emailsInvites: participants.emails.filter((email) => email !== hote.googleEmail),
        fournisseur: session.type === 'collectif' ? 'jitsi' : 'google_meet',
      })

      // upsert plutôt qu'insert : la séance a déjà une ligne visio (lien interne) dans
      // l'immense majorité des cas, c'est précisément celle qu'on remplace.
      const { error } = await serviceClient.from('video_sessions').upsert(
        {
          session_id: session.id,
          provider: fournisseur,
          room_ref: lienVisio,
          statut: 'planifiee',
          google_event_id: eventId,
          organisateur_email: hote.googleEmail,
        },
        { onConflict: 'session_id' },
      )
      if (error) {
        return Response.json({ error: error.message }, { status: 500 })
      }

      await noterErreurHote(serviceClient, hote, null)
      return Response.json({ lienMeet: lienVisio })
    } catch (error) {
      await noterErreurHote(serviceClient, hote, messageErreur(error))
      return Response.json({ error: messageErreur(error) }, { status: 502 })
    }
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
