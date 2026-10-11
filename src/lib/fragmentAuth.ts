/* Ce que l'URL portait au tout premier instant, avant que supabase-js ne la nettoie.
 *
 * Les liens d'authentification (première connexion, mot de passe oublié) reviennent avec leur
 * jeton — ou leur motif de refus — dans le FRAGMENT : `#access_token=…` ou
 * `#error=access_denied&error_code=otp_expired&…`. `detectSessionInUrl` le consomme puis vide le
 * fragment, si bien que l'écran d'atterrissage ne voyait plus qu'une chose : « pas de session ».
 * Tous les échecs y prenaient le même visage, « Lien expiré », quelle qu'en soit la vraie cause —
 * impossible de distinguer un jeton réellement périmé d'un jeton JAMAIS ARRIVÉ (voir ci-dessous).
 *
 * Lu ici à l'évaluation du module, et importé par `supabaseClient.ts` avant la création du client :
 * c'est le seul moment garanti d'être antérieur au nettoyage.
 *
 * Cas mobile, à l'origine de ce module (signalé par le client le 2026-10-11) : le lien pointe sur
 * le domaine apex, qui redirige en 308 vers `www`. Un navigateur réattache normalement le
 * fragment après une redirection, mais les navigateurs intégrés aux applications (Gmail,
 * Facebook, Messenger…) ne le font pas toujours — l'utilisateur arrive alors sur la page avec une
 * URL complètement nue. Fragment vide ET aucun jeton : le lien n'a pas expiré, il est arrivé
 * amputé, et le message doit le dire pour que la personne sache quoi faire (l'ouvrir dans son
 * navigateur).
 */

export interface FragmentAuth {
  /* Vrai dès que l'URL d'arrivée portait quelque chose d'exploitable : un jeton, ou un refus
     nommé par Supabase. Faux = la clé n'est jamais arrivée jusqu'ici. */
  present: boolean
  /* Refus explicite de Supabase, quand il y en a un (`otp_expired`, `access_denied`…). */
  erreur: { code: string | null; description: string | null } | null
}

/* Séparée de la lecture pour être testable : c'est l'analyse qui peut se tromper, pas l'accès à
   `window`. */
export function analyserFragmentAuth(hash: string): FragmentAuth {
  const parametres = new URLSearchParams(hash.replace(/^#/, ''))
  return {
    present: parametres.has('access_token') || parametres.has('error'),
    erreur: parametres.get('error')
      ? {
          code: parametres.get('error_code') ?? parametres.get('error'),
          description: parametres.get('error_description')?.replace(/\+/g, ' ') ?? null,
        }
      : null,
  }
}

const fragment = analyserFragmentAuth(typeof window !== 'undefined' ? window.location.hash : '')

export const fragmentAuthPresent = fragment.present
export const erreurFragmentAuth = fragment.erreur
