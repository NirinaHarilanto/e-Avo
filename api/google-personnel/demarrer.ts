import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { googleEstConfigure, signerState, urlAutorisation, SCOPE_GOOGLE_PERSONNEL, GoogleError } from '../_lib/google.js'

export const config = { runtime: 'edge' }

/**
 * Première étape de la connexion du Google Calendar PERSONNEL d'un professeur ou d'un admin
 * (0098, demande client du 2026-10-05) — même mécanique que api/admin/google-oauth-demarrer.ts
 * (état signé côté serveur pour rattacher le retour de Google à la bonne personne), mais ouverte
 * aux deux rôles (`requireTeacherOrAdmin`, pas `requireAdmin`) et avec le scope lecture seule.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { profileId, etablissementId } = await requireTeacherOrAdmin(request)

    if (!googleEstConfigure()) {
      return Response.json(
        { error: "L'intégration Google n'est pas encore configurée sur le serveur (identifiants OAuth manquants)." },
        { status: 503 },
      )
    }

    const state = await signerState('personnel', { etablissementId, profileId })
    return Response.json({ url: urlAutorisation(state, SCOPE_GOOGLE_PERSONNEL) })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof GoogleError) {
      return Response.json({ error: error.message }, { status: 503 })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
