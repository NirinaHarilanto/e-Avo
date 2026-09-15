/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Intégration Google Calendar / Google Meet.
 *
 * Pourquoi Calendar pour obtenir un lien Meet : Google ne publie aucune API « créer une réunion
 * Meet ». Le seul moyen gratuit et automatisable est de créer un événement Calendar en demandant
 * une conférence (`conferenceData.createRequest`) — Google renvoie alors un `hangoutLink`
 * meet.google.com, définitif, réutilisable, et l'événement porte l'invitation des participants.
 *
 * Un seul compte Google est connecté, celui de l'établissement : les séances de tous les
 * professeurs sont créées dans son agenda, professeur et élèves étant ajoutés en invités. Aucun
 * professeur n'a donc de compte Google à posséder ni à autoriser.
 *
 * Tout ce fichier tourne en runtime edge : WebCrypto (`crypto.subtle`), jamais `node:crypto`.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
export const SCOPE_GOOGLE = 'https://www.googleapis.com/auth/calendar.events'

export class GoogleError extends Error {}

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  const cleChiffrement = process.env.GOOGLE_TOKEN_KEY
  if (!clientId || !clientSecret || !redirectUri || !cleChiffrement) {
    throw new GoogleError('Intégration Google non configurée sur le serveur.')
  }
  return { clientId, clientSecret, redirectUri, cleChiffrement }
}

export function googleEstConfigure(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.GOOGLE_TOKEN_KEY,
  )
}

/* ---------- Chiffrement du jeton de rafraîchissement ---------- */

async function cleAes(secret: string) {
  // La clé d'environnement est une phrase quelconque : on la réduit en 256 bits par SHA-256
  // plutôt que d'imposer un format hexadécimal exact à la saisie.
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', empreinte, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function versBase64(octets: Uint8Array): string {
  return btoa(String.fromCharCode(...octets))
}

function depuisBase64(valeur: string): Uint8Array {
  return Uint8Array.from(atob(valeur), (c) => c.charCodeAt(0))
}

export async function chiffrer(valeur: string): Promise<string> {
  const { cleChiffrement } = config()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const chiffre = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await cleAes(cleChiffrement),
    new TextEncoder().encode(valeur),
  )
  // iv:contenu — l'IV n'est pas secret, il doit juste être unique par chiffrement.
  return `${versBase64(iv)}:${versBase64(new Uint8Array(chiffre))}`
}

export async function dechiffrer(valeur: string): Promise<string> {
  const { cleChiffrement } = config()
  const [iv, contenu] = valeur.split(':')
  if (!iv || !contenu) throw new GoogleError('Jeton Google illisible.')
  const clair = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: depuisBase64(iv) },
    await cleAes(cleChiffrement),
    depuisBase64(contenu),
  )
  return new TextDecoder().decode(clair)
}

/* ---------- État OAuth (paramètre `state`) ---------- */

/* Google renvoie l'utilisateur sur une URL de rappel, en simple navigation de navigateur : ni
   jeton Supabase ni en-tête d'autorisation ne survivent à l'aller-retour. Le `state` transporte
   donc lui-même l'établissement et l'admin à l'origine de la demande, signé et horodaté pour
   qu'il ne puisse être ni fabriqué ni rejoué (protection CSRF exigée par OAuth 2). */

const VALIDITE_STATE_MS = 10 * 60 * 1000

async function cleSignature() {
  const { cleChiffrement } = config()
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${cleChiffrement}:oauth-state`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signerState(donnees: { etablissementId: string; profileId: string }): Promise<string> {
  const charge = versBase64(new TextEncoder().encode(JSON.stringify({ ...donnees, emisLe: Date.now() })))
  const signature = await crypto.subtle.sign('HMAC', await cleSignature(), new TextEncoder().encode(charge))
  return `${charge}.${versBase64(new Uint8Array(signature))}`
}

export async function verifierState(state: string): Promise<{ etablissementId: string; profileId: string }> {
  const [charge, signature] = state.split('.')
  if (!charge || !signature) throw new GoogleError('Paramètre de sécurité manquant.')

  const valide = await crypto.subtle.verify(
    'HMAC',
    await cleSignature(),
    depuisBase64(signature),
    new TextEncoder().encode(charge),
  )
  if (!valide) throw new GoogleError('Paramètre de sécurité invalide.')

  const donnees = JSON.parse(new TextDecoder().decode(depuisBase64(charge))) as {
    etablissementId: string
    profileId: string
    emisLe: number
  }
  if (Date.now() - donnees.emisLe > VALIDITE_STATE_MS) {
    throw new GoogleError('Demande de connexion expirée, relancez-la depuis vos paramètres.')
  }
  return { etablissementId: donnees.etablissementId, profileId: donnees.profileId }
}

/* ---------- OAuth ---------- */

export function urlAutorisation(state: string): string {
  const { clientId, redirectUri } = config()
  const parametres = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE_GOOGLE,
    // offline + consent : indispensables pour recevoir un refresh_token, et pour en recevoir un
    // nouveau si l'établissement reconnecte un autre compte.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${parametres}`
}

export async function echangerCode(code: string): Promise<{ refreshToken: string; accessToken: string; scope: string }> {
  const { clientId, clientSecret, redirectUri } = config()
  const reponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const corps = (await reponse.json()) as { refresh_token?: string; access_token?: string; scope?: string; error_description?: string }
  if (!reponse.ok || !corps.access_token) {
    throw new GoogleError(corps.error_description ?? "Google a refusé l'autorisation.")
  }
  if (!corps.refresh_token) {
    // Arrive quand le compte a déjà autorisé l'application et que Google ne renvoie qu'un jeton
    // d'accès. `prompt=consent` ci-dessus l'évite ; ce garde-fou reste utile si le paramètre
    // disparaissait un jour.
    throw new GoogleError('Google n’a pas renvoyé de jeton durable. Révoquez l’accès dans votre compte Google puis réessayez.')
  }
  return { refreshToken: corps.refresh_token, accessToken: corps.access_token, scope: corps.scope ?? SCOPE_GOOGLE }
}

export async function emailDuCompte(accessToken: string): Promise<string> {
  const reponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!reponse.ok) return 'compte Google'
  const corps = (await reponse.json()) as { email?: string }
  return corps.email ?? 'compte Google'
}

async function jetonAcces(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = config()
  const reponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const corps = (await reponse.json()) as { access_token?: string; error_description?: string; error?: string }
  if (!reponse.ok || !corps.access_token) {
    throw new GoogleError(corps.error_description ?? corps.error ?? 'Connexion Google expirée.')
  }
  return corps.access_token
}

/* ---------- Agenda de l'établissement ---------- */

export interface IntegrationGoogle {
  etablissementId: string
  accessToken: string
  googleEmail: string
}

/** `null` si l'établissement n'a connecté aucun compte : l'appelant retombe alors sur le stub. */
export async function integrationDeLEtablissement(
  serviceClient: ServiceClient,
  etablissementId: string,
): Promise<IntegrationGoogle | null> {
  if (!googleEstConfigure()) return null
  const { data } = await serviceClient
    .from('google_integrations')
    .select('etablissement_id, google_email, refresh_token_chiffre')
    .eq('etablissement_id', etablissementId)
    .maybeSingle()
  if (!data) return null

  const refreshToken = await dechiffrer(data.refresh_token_chiffre)
  const accessToken = await jetonAcces(refreshToken)
  return { etablissementId, accessToken, googleEmail: data.google_email }
}

/* Une erreur Google ne doit jamais faire échouer la planification d'un cours : la séance existe
   en base, seul le lien de visio manque. On garde la trace de l'incident pour l'afficher dans
   l'écran d'administration, où un bouton permet de générer le lien après coup. */
export async function noterErreurGoogle(serviceClient: ServiceClient, etablissementId: string, message: string | null) {
  await serviceClient
    .from('google_integrations')
    .update({ derniere_erreur: message })
    .eq('etablissement_id', etablissementId)
}

interface ParamsEvenement {
  titre: string
  description?: string
  debut: string
  dureeMinutes: number
  emailsInvites: string[]
}

function bornes(debut: string, dureeMinutes: number) {
  const depart = new Date(debut)
  const fin = new Date(depart.getTime() + dureeMinutes * 60_000)
  return { start: { dateTime: depart.toISOString() }, end: { dateTime: fin.toISOString() } }
}

export async function creerEvenementMeet(
  integration: IntegrationGoogle,
  params: ParamsEvenement,
): Promise<{ eventId: string; lienMeet: string }> {
  const reponse = await fetch(`${CALENDAR_URL}?conferenceDataVersion=1&sendUpdates=all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${integration.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: params.titre,
      description: params.description,
      ...bornes(params.debut, params.dureeMinutes),
      attendees: params.emailsInvites.map((email) => ({ email })),
      // C'est ce bloc, et lui seul, qui fait naître le lien Meet.
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }),
  })

  const corps = (await reponse.json()) as {
    id?: string
    hangoutLink?: string
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
    error?: { message?: string }
  }
  if (!reponse.ok || !corps.id) {
    throw new GoogleError(corps.error?.message ?? "Google Calendar a refusé la création de l'événement.")
  }

  const lienMeet =
    corps.hangoutLink ?? corps.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri
  if (!lienMeet) {
    throw new GoogleError('Événement créé sans lien Meet.')
  }
  return { eventId: corps.id, lienMeet }
}

/** Déplace un événement existant : le lien Meet, lui, ne change pas. */
export async function deplacerEvenement(
  integration: IntegrationGoogle,
  eventId: string,
  debut: string,
  dureeMinutes: number,
): Promise<void> {
  const reponse = await fetch(`${CALENDAR_URL}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${integration.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(bornes(debut, dureeMinutes)),
  })
  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new GoogleError(corps?.error?.message ?? "Google Calendar a refusé le déplacement de l'événement.")
  }
}

/**
 * Périodes déjà occupées dans l'agenda de l'établissement, pour ne pas proposer à un prospect un
 * créneau où l'établissement est en réalité pris. Passe par `events.list` plutôt que par l'API
 * freebusy : le scope déjà accordé (`calendar.events`) suffit, là où freebusy demanderait un
 * nouveau consentement de l'établissement.
 *
 * Les événements « toute la journée » (`date` sans `dateTime`) sont ignorés : ce sont des repères
 * (anniversaires, jours fériés) qui bloqueraient des journées entières sans raison.
 */
export async function occupationsAgenda(
  integration: IntegrationGoogle,
  debut: Date,
  fin: Date,
): Promise<{ debut: string; fin: string }[]> {
  const parametres = new URLSearchParams({
    timeMin: debut.toISOString(),
    timeMax: fin.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  })
  const reponse = await fetch(`${CALENDAR_URL}?${parametres}`, {
    headers: { Authorization: `Bearer ${integration.accessToken}` },
  })
  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new GoogleError(corps?.error?.message ?? "Google Calendar a refusé la lecture de l'agenda.")
  }

  const corps = (await reponse.json()) as {
    items?: { status?: string; transparency?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[]
  }
  return (corps.items ?? [])
    .filter((e) => e.status !== 'cancelled' && e.transparency !== 'transparent')
    .map((e) => ({ debut: e.start?.dateTime, fin: e.end?.dateTime }))
    .filter((e): e is { debut: string; fin: string } => Boolean(e.debut && e.fin))
}

export async function supprimerEvenement(integration: IntegrationGoogle, eventId: string): Promise<void> {
  const reponse = await fetch(`${CALENDAR_URL}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${integration.accessToken}` },
  })
  // 404/410 : l'événement a déjà disparu côté Google, le résultat voulu est atteint.
  if (!reponse.ok && reponse.status !== 404 && reponse.status !== 410) {
    throw new GoogleError("Google Calendar a refusé la suppression de l'événement.")
  }
}
