/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { chiffrer, echangerCode, emailDuCompte, verifierState, GoogleError } from '../_lib/google.js'

export const config = { runtime: 'edge' }

/* Une seule permission exigée pour les deux intégrations depuis 0107 : l'agenda d'établissement
   comme l'agenda personnel d'un professeur doivent pouvoir recevoir des événements. La lecture
   seule, qui suffisait à l'intégration personnelle sous le régime de 0098, n'est plus acceptée. */
const SCOPE_CALENDRIER_ECRITURE = 'https://www.googleapis.com/auth/calendar.events'

/**
 * Refuse d'enregistrer une intégration à laquelle Google n'a pas accordé la permission d'agenda.
 *
 * Google renvoie dans `scope` les permissions EFFECTIVEMENT cochées, pas celles demandées : les
 * permissions sensibles — l'agenda en est une — apparaissent sur son écran de consentement dans
 * une case à part, que l'utilisateur peut laisser décochée sans s'en rendre compte. Le jeton est
 * alors parfaitement valide, mais ne donne accès à rien d'utile.
 *
 * Sans ce garde-fou, l'intégration s'installait quand même et l'écran annonçait « Compte Google
 * connecté. Les prochaines séances seront inscrites à l'agenda » — exactement ce qui est arrivé le
 * 2026-10-09 : le compte était branché depuis des heures, aucune séance n'atteignait l'agenda, et
 * rien ne le signalait. Mieux vaut un échec explicite qui dit quelle case cocher.
 */
function exigerPermission(scopeAccorde: string, scopeRequis: string, libelle: string): void {
  if (scopeAccorde.split(/\s+/).includes(scopeRequis)) return
  throw new GoogleError(
    `La permission « ${libelle} » n'a pas été accordée. Relancez la connexion et cochez cette case sur l'écran Google, sans quoi rien ne peut être inscrit à l'agenda.`,
  )
}

// Retour de Google après autorisation. C'est une navigation de navigateur, pas un appel de
// l'application : aucun jeton Supabase n'accompagne la requête. L'établissement (et, pour le
// flux personnel, la personne) concernés sont donc lus dans le `state` signé émis à l'étape
// précédente (google-oauth-demarrer.ts ou google-personnel/demarrer.ts), seule preuve vérifiable
// de l'origine de la demande.
//
// Unique point de retour pour les DEUX intégrations (établissement et personnelle, 0098) : Google
// exige que `redirect_uri` corresponde exactement à une URL enregistrée dans sa console, il n'en
// existe qu'une pour ce projet — `state.type` indique donc laquelle des deux traiter, plutôt
// qu'une seconde route de callback qui demanderait une seconde URL à faire enregistrer.
//
// Se termine toujours par une redirection vers un écran de l'application, avec le résultat en
// paramètre d'URL : l'utilisateur ne doit jamais tomber sur du JSON brut.
export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)

  const erreurGoogle = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // Avant d'avoir déchiffré `state`, impossible de savoir vers quel écran renvoyer : les
  // paramètres (établissement) restent la destination par défaut d'une erreur précoce, la plus
  // fréquente des deux flux.
  if (erreurGoogle || !code || !state) {
    const retour = new URL('/admin/parametres', url.origin)
    retour.searchParams.set('google', 'erreur')
    retour.searchParams.set(
      'message',
      erreurGoogle === 'access_denied' ? "Autorisation refusée dans l'écran Google." : 'Autorisation Google incomplète.',
    )
    return Response.redirect(retour.toString(), 302)
  }

  try {
    const { type, etablissementId, profileId } = await verifierState(state)
    const { refreshToken, accessToken, scope } = await echangerCode(code)

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SECRET_KEY
    if (!supabaseUrl || !serviceKey) {
      throw new GoogleError('Configuration Supabase serveur manquante.')
    }
    const serviceClient = createClient<Database>(supabaseUrl, serviceKey)

    if (type === 'personnel') {
      const { data: profil } = await serviceClient.from('profiles').select('role').eq('id', profileId).maybeSingle()
      const retour = new URL(profil?.role === 'professeur' ? '/professeur/mon-profil' : '/admin/mon-profil', url.origin)

      /* L'ÉCRITURE est exigée depuis 0107, là où la lecture suffisait sous le régime de 0098 :
         l'agenda personnel d'un professeur reçoit désormais les réunions de ses cours. Laisser
         passer une autorisation en lecture seule installerait une intégration à moitié inerte —
         l'agenda s'afficherait, mais ses cours continueraient de partir du compte de
         l'établissement, sans que rien ne le signale au moment de la connexion. */
      exigerPermission(scope, SCOPE_CALENDRIER_ECRITURE, 'Afficher et modifier les événements de vos agendas Google')

      const { error } = await serviceClient.from('google_integrations_personnelles').upsert(
        {
          profile_id: profileId,
          etablissement_id: etablissementId,
          google_email: await emailDuCompte(accessToken),
          refresh_token_chiffre: await chiffrer(refreshToken),
          scope,
          connecte_le: new Date().toISOString(),
          derniere_erreur: null,
        },
        { onConflict: 'profile_id' },
      )
      if (error) throw new GoogleError(error.message)

      retour.searchParams.set('google', 'ok')
      return Response.redirect(retour.toString(), 302)
    }

    const retour = new URL('/admin/parametres', url.origin)
    exigerPermission(scope, SCOPE_CALENDRIER_ECRITURE, 'Afficher et modifier les événements de vos agendas Google')

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
    // `state` n'a pas pu être lu avant l'échec (signature invalide, expirée) : impossible de
    // distinguer les deux flux, on retombe sur la destination par défaut.
    const retour = new URL('/admin/parametres', url.origin)
    retour.searchParams.set('google', 'erreur')
    retour.searchParams.set('message', error instanceof GoogleError ? error.message : 'La connexion Google a échoué.')
    return Response.redirect(retour.toString(), 302)
  }
}
