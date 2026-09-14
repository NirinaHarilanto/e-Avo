/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { chiffrer, echangerCode, emailDuCompte, verifierState, GoogleError } from '../_lib/google.js'

export const config = { runtime: 'edge' }

// Retour de Google après autorisation. C'est une navigation de navigateur, pas un appel de
// l'application : aucun jeton Supabase n'accompagne la requête. L'établissement concerné est
// donc lu dans le `state` signé émis à l'étape précédente (google-oauth-demarrer.ts), seule
// preuve vérifiable que cette demande vient bien d'un admin de cet établissement.
//
// Se termine toujours par une redirection vers l'écran des paramètres, avec le résultat en
// paramètre d'URL : l'utilisateur ne doit jamais tomber sur du JSON brut.
export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const retour = new URL('/admin/parametres', url.origin)

  const erreurGoogle = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (erreurGoogle || !code || !state) {
    retour.searchParams.set('google', 'erreur')
    retour.searchParams.set(
      'message',
      erreurGoogle === 'access_denied' ? "Autorisation refusée dans l'écran Google." : 'Autorisation Google incomplète.',
    )
    return Response.redirect(retour.toString(), 302)
  }

  try {
    const { etablissementId, profileId } = await verifierState(state)
    const { refreshToken, accessToken, scope } = await echangerCode(code)

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SECRET_KEY
    if (!supabaseUrl || !serviceKey) {
      throw new GoogleError('Configuration Supabase serveur manquante.')
    }
    const serviceClient = createClient<Database>(supabaseUrl, serviceKey)

    const { error } = await serviceClient.from('google_integrations').upsert(
      {
        etablissement_id: etablissementId,
        google_email: await emailDuCompte(accessToken),
        refresh_token_chiffre: await chiffrer(refreshToken),
        scope,
        connecte_par: profileId,
        connecte_le: new Date().toISOString(),
        derniere_erreur: null,
      },
      { onConflict: 'etablissement_id' },
    )
    if (error) throw new GoogleError(error.message)

    retour.searchParams.set('google', 'ok')
    return Response.redirect(retour.toString(), 302)
  } catch (error) {
    retour.searchParams.set('google', 'erreur')
    retour.searchParams.set('message', error instanceof GoogleError ? error.message : 'La connexion Google a échoué.')
    return Response.redirect(retour.toString(), 302)
  }
}
