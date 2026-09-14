import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { googleEstConfigure, signerState, urlAutorisation, GoogleError } from '../_lib/google.js'

export const config = { runtime: 'edge' }

// Première étape de la connexion du compte Google de l'établissement : l'admin authentifié
// demande ici l'URL d'autorisation, le navigateur l'ouvre ensuite. L'URL n'est pas construite
// côté client parce qu'elle doit porter un `state` signé par le serveur (voir google.ts) —
// c'est lui qui rattachera le retour de Google au bon établissement.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { profileId, etablissementId } = await requireAdmin(request)

    if (!googleEstConfigure()) {
      return Response.json(
        { error: "L'intégration Google n'est pas encore configurée sur le serveur (identifiants OAuth manquants)." },
        { status: 503 },
      )
    }

    const state = await signerState({ etablissementId, profileId })
    return Response.json({ url: urlAutorisation(state) })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof GoogleError) {
      return Response.json({ error: error.message }, { status: 503 })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
