/* Synchronisation instantanée entre espaces (admin, professeur, étudiant) — demande client du
   2026-09-29 : « les agendas des professeurs, étudiants et admin dans leurs espaces respectifs
   doivent être cohérents et à jour instantanément ».

   Pourquoi pas `postgres_changes` : il exige que chaque table soit ajoutée à la publication
   `supabase_realtime` (migration à appliquer à la main, cf. 0083 toujours en attente), et que
   la policy RLS de chaque table suive. Le Broadcast Supabase, lui, ne dépend d'aucune migration :
   un simple « quelque chose a changé dans l'établissement » est diffusé sur le canal
   `synchro:<etablissement_id>`, sans aucune donnée métier dans le message (le contenu reste lu
   par les requêtes habituelles, donc toujours filtré par RLS). Chaque navigateur connecté
   recharge alors les données affichées par la page ouverte (voir useCacheRequete.ts).

   Deux émetteurs :
   - le serveur, à chaque notification métier (api/_lib/synchro.ts, appelé par
     creerNotification) — couvre aussi les actions de visiteurs anonymes (réservation d'appel) ;
   - le navigateur qui vient de réussir une écriture (fetchAvecSynchro ci-dessous, branché sur le
     client Supabase et sur les appels `/api/*`) — couvre les écritures directes en base sans
     notification (déplacer une séance, glisser une carte du pipeline...).

   Anti-boucle : un rechargement déclenché par un signal ne fait que des lectures. Les lectures
   PostgREST sont toujours en GET ; les quelques routes `/api` de lecture appelées en POST sont
   listées dans LECTURES_API, à compléter si une nouvelle route de lecture en POST apparaît. */

type Ecouteur = () => void

const ecouteurs = new Set<Ecouteur>()
let minuterieLocale: ReturnType<typeof setTimeout> | null = null

/* Abonne un rechargement au signal. Renvoie la fonction de désabonnement. */
export function surSynchro(ecouteur: Ecouteur): () => void {
  ecouteurs.add(ecouteur)
  return () => {
    ecouteurs.delete(ecouteur)
  }
}

/* Appelé à la réception d'un signal distant. Regroupé (250 ms) : une même action serveur crée
   souvent plusieurs notifications, donc plusieurs signaux quasi simultanés. */
export function declencherSynchroLocale() {
  if (minuterieLocale) clearTimeout(minuterieLocale)
  minuterieLocale = setTimeout(() => {
    minuterieLocale = null
    for (const e of [...ecouteurs]) e()
  }, 250)
}

let emetteur: (() => void) | null = null
let minuterieEmission: ReturnType<typeof setTimeout> | null = null

/* Posé par useSynchroEtablissement une fois le canal ouvert, retiré à la déconnexion. */
export function definirEmetteurSynchro(fn: (() => void) | null) {
  emetteur = fn
}

function signalerMutation() {
  if (minuterieEmission) clearTimeout(minuterieEmission)
  minuterieEmission = setTimeout(() => {
    minuterieEmission = null
    emetteur?.()
  }, 300)
}

const LECTURES_API = ['/api/etudiant/mon-rendez-vous', '/api/prospects/creneaux', '/api/auth/verifier-email', '/api/admin/google-oauth-demarrer']

export function estEcritureSuivie(url: string, methode: string): boolean {
  const m = methode.toUpperCase()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false
  const chemin = (() => {
    try {
      return new URL(url, 'http://local').pathname
    } catch {
      return url
    }
  })()
  if (chemin.startsWith('/rest/v1/')) {
    // Marquer une notification lue ne concerne que soi.
    return !chemin.startsWith('/rest/v1/notifications')
  }
  if (chemin.startsWith('/api/')) return !LECTURES_API.some((l) => chemin.startsWith(l))
  return false
}

/* Référence capturée avant toute installation : fetchAvecSynchro remplace window.fetch (voir
   installerSynchroFetch), il ne doit donc jamais se rappeler lui-même. */
const fetchOriginal: typeof fetch = globalThis.fetch.bind(globalThis)

export const fetchAvecSynchro: typeof fetch = async (input, init) => {
  const reponse = await fetchOriginal(input, init)
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const methode = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (reponse.ok && estEcritureSuivie(url, methode)) signalerMutation()
  } catch {
    // Jamais bloquant : la synchronisation n'est qu'un confort.
  }
  return reponse
}

/* Les appels `/api/*` sont faits avec le `fetch` global depuis une trentaine de composants :
   plutôt que de les modifier un à un (et d'en oublier un demain), le `fetch` de la fenêtre est
   remplacé une fois pour toutes au démarrage (main.tsx). Le client Supabase reçoit, lui,
   fetchAvecSynchro explicitement (supabaseClient.ts) : il capture sa fonction fetch à la
   création, avant que main.tsx n'ait forcément tourné. */
export function installerSynchroFetch() {
  if (typeof window === 'undefined' || window.fetch === fetchAvecSynchro) return
  window.fetch = fetchAvecSynchro
}
