/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creerLienJitsi, DOMAINE_JITSI } from '../../src/lib/visio.js'

/* Instance de visioconférence effectivement utilisée. `VISIO_DOMAINE` permet d'en changer depuis
   les variables d'environnement, sans redéploiement : une instance publique peut fermer ou se
   mettre à exiger un compte du jour au lendemain — c'est précisément ce qui est arrivé à
   meet.jit.si, et ce qui a motivé ce réglage. */
export function domaineVisio(): string {
  return process.env.VISIO_DOMAINE?.trim() || DOMAINE_JITSI
}

export function nouveauLienVisio(): string {
  return creerLienJitsi(domaineVisio())
}

/**
 * Fournisseur de visioconférence d'une réunion donnée. Deux valeurs, et le choix ne se fait PAS
 * au hasard des écrans : il suit le nombre de participants attendus (règle client du 2026-10-09).
 *
 * - `google_meet` : réunions à petit effectif identifié nominativement — appel diagnostic
 *   (individuel ou duo), cours individuel ou duo, rendez-vous créé par un admin ou un professeur.
 *   Chaque participant est invité par son adresse e-mail sur l'événement Calendar, donc reconnu
 *   par Meet et admis sans friction. Redevenu possible le 2026-10-09 : l'établissement est passé
 *   d'un compte Gmail gratuit à un compte Google Workspace (`admin@harionlineclub.com`), là où
 *   c'était la gratuité du compte hôte qui fermait la porte aux invités en octobre.
 * - `jitsi` : réunions collectives — cours collectifs et sessions de test oral d'une vague. Elles
 *   réunissent un groupe entier, dont des candidats pas encore inscrits et sans adresse connue au
 *   moment où la salle est créée ; aucun compte n'y est exigé, le lien s'ouvre tel quel.
 */
export type FournisseurVisio = 'google_meet' | 'jitsi'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Intégration Google Calendar.
 *
 * Calendar sert à l'agenda et aux invitations : il tient le planning de l'établissement et envoie
 * lui-même les convocations aux participants (`sendUpdates=all`). Il ne fournit PLUS le lien de
 * visioconférence depuis le 2026-10-07 : une réunion Meet hébergée par un compte Gmail gratuit —
 * celui de l'établissement — est fermée à toute personne non connectée à un compte Google, ce qui
 * excluait une partie des élèves de HOC. Le lien est désormais une salle Jitsi (voir
 * `creerEvenementVisio` et src/lib/visio.ts), qui n'exige aucun compte.
 *
 * Un seul compte Google est connecté, celui de l'établissement : les séances de tous les
 * professeurs sont créées dans son agenda, professeur et élèves étant ajoutés en invités. Aucun
 * professeur n'a donc de compte Google à posséder ni à autoriser.
 *
 * Tout ce fichier tourne en runtime edge : WebCrypto (`crypto.subtle`), jamais `node:crypto`.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
/* `userinfo.email` ajouté le 2026-10-09 : sans lui, `emailDuCompte()` plus bas ne reçoit rien de
   Google et l'écran Paramètres se rabat sur le libellé « compte Google ». C'est précisément ce
   qu'affiche le compte connecté depuis 2026-09-15, et cela empêche de vérifier d'un coup d'œil
   QUELLE boîte alimente l'agenda — nécessaire maintenant que le client bascule de
   `harionlineclub.app@gmail.com` vers `admin@harionlineclub.com`. Scope non sensible au sens de
   Google : il n'entraîne aucune revalidation de l'écran de consentement. Les comptes déjà
   connectés gardent leur jeton et leur ancien périmètre ; l'adresse n'apparaîtra qu'à la
   prochaine reconnexion, qui est justement ce qui est en train d'être fait. */
export const SCOPE_GOOGLE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'
/* Agenda Google PERSONNEL (0098, demande client du 2026-10-05) : lecture seule — contrairement à
   l'intégration d'établissement ci-dessus, celle-ci n'a jamais besoin de créer d'événement, elle
   ne fait qu'afficher les événements existants en superposition dans l'agenda HOC de la
   personne. Un scope plus étroit limite aussi ce qu'une fuite de jeton pourrait permettre. */
export const SCOPE_GOOGLE_PERSONNEL = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email'

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

/* `type` distingue les deux intégrations qui partagent désormais ce même aller-retour OAuth
   (0098) : celle de l'établissement (un seul compte, crée les liens Meet) et celle, personnelle,
   de chaque professeur/admin (lecture seule de son propre agenda). Les deux utilisent la MÊME
   URL de callback — google-oauth-callback.ts, qui branche sur ce champ — plutôt qu'une seconde
   route : Google exige que `redirect_uri` corresponde EXACTEMENT à une URL enregistrée dans sa
   console, et il n'en existe qu'une seule pour ce projet (`GOOGLE_REDIRECT_URI`). Par défaut
   'etablissement' si absent, pour rester compatible avec un lien déjà émis au moment du
   déploiement de ce changement. */
export async function signerState(type: 'etablissement' | 'personnel', donnees: { etablissementId: string; profileId: string }): Promise<string> {
  const charge = versBase64(new TextEncoder().encode(JSON.stringify({ type, ...donnees, emisLe: Date.now() })))
  const signature = await crypto.subtle.sign('HMAC', await cleSignature(), new TextEncoder().encode(charge))
  return `${charge}.${versBase64(new Uint8Array(signature))}`
}

export async function verifierState(state: string): Promise<{ type: 'etablissement' | 'personnel'; etablissementId: string; profileId: string }> {
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
    type?: 'etablissement' | 'personnel'
    etablissementId: string
    profileId: string
    emisLe: number
  }
  if (Date.now() - donnees.emisLe > VALIDITE_STATE_MS) {
    throw new GoogleError('Demande de connexion expirée, relancez-la depuis vos paramètres.')
  }
  return { type: donnees.type ?? 'etablissement', etablissementId: donnees.etablissementId, profileId: donnees.profileId }
}

/* ---------- OAuth ---------- */

export function urlAutorisation(state: string, scope: string = SCOPE_GOOGLE): string {
  const { clientId, redirectUri } = config()
  const parametres = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
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

/* ---------- Agenda PERSONNEL (0098) ---------- */

export interface IntegrationGooglePersonnelle {
  profileId: string
  accessToken: string
  googleEmail: string
}

/** `null` si cette personne n'a connecté aucun compte personnel : l'appelant n'affiche alors
    simplement aucune superposition, sans aucune erreur — c'est l'état normal de la plupart des
    comptes. */
export async function integrationPersonnelleDeLaPersonne(
  serviceClient: ServiceClient,
  profileId: string,
): Promise<IntegrationGooglePersonnelle | null> {
  if (!googleEstConfigure()) return null
  const { data } = await serviceClient
    .from('google_integrations_personnelles')
    .select('profile_id, google_email, refresh_token_chiffre')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!data) return null

  const refreshToken = await dechiffrer(data.refresh_token_chiffre)
  const accessToken = await jetonAcces(refreshToken)
  return { profileId, accessToken, googleEmail: data.google_email }
}

export async function noterErreurGooglePersonnelle(serviceClient: ServiceClient, profileId: string, message: string | null) {
  await serviceClient.from('google_integrations_personnelles').update({ derniere_erreur: message }).eq('profile_id', profileId)
}

/* Événements du calendrier personnel sur une fenêtre donnée — lecture seule, jamais réutilisés
   pour créer ou modifier quoi que ce soit côté Google (voir SCOPE_GOOGLE_PERSONNEL). Les
   événements « toute la journée » sont ignorés, même raison que `occupationsAgenda` : ce sont des
   repères (anniversaires, jours fériés), pas des créneaux occupés à afficher dans un agenda
   horaire. */
export interface InviteGoogle {
  email: string
  nom: string | null
  /* `accepted` | `declined` | `tentative` | `needsAction`, tels que Google les nomme. */
  reponse: string
  organisateur: boolean
  optionnel: boolean
}

export interface EvenementGoogle {
  id: string
  titre: string
  debut: string
  fin: string
  description: string | null
  lieu: string | null
  invites: InviteGoogle[]
  organisateur: { email: string; nom: string | null } | null
  /* Minutes avant le début, pour chaque rappel posé sur l'événement. */
  rappels: number[]
  /* Règle de répétition en toutes lettres (« Toutes les semaines le lundi, mardi… »), reconstruite
     depuis la RRULE de l'événement maître — voir `decrireRecurrence`. */
  recurrence: string | null
  /* Couleur de la pastille telle qu'elle apparaît dans Google Agenda, pour que l'agenda HOC
     présente les mêmes repères visuels. */
  couleur: string | null
  lienGoogle: string | null
  /* Un événement récurrent ne peut pas être modifié occurrence par occurrence depuis HOC sans
     ouvrir la question « cette occurrence ou toute la série ? », à laquelle l'écran ne sait pas
     répondre. Il reste donc en lecture seule, comme les agendas personnels. */
  recurrent: boolean
}

/* Palette officielle de Google Agenda (`colorId` d'un événement). Reprise en dur plutôt que lue
   via l'API `colors` : elle ne change jamais, et un appel de plus à chaque affichage d'agenda
   coûterait un aller-retour pour onze valeurs figées. */
const COULEURS_GOOGLE: Record<string, string> = {
  '1': '#7986cb',
  '2': '#33b679',
  '3': '#8e24aa',
  '4': '#e67c73',
  '5': '#f6bf26',
  '6': '#f4511e',
  '7': '#039be5',
  '8': '#616161',
  '9': '#3f51b5',
  '10': '#0b8043',
  '11': '#d50000',
}

const JOURS_RRULE: Record<string, string> = {
  MO: 'lundi',
  TU: 'mardi',
  WE: 'mercredi',
  TH: 'jeudi',
  FR: 'vendredi',
  SA: 'samedi',
  SU: 'dimanche',
}

/**
 * Traduit la RRULE d'un événement récurrent en une phrase française, comme le fait le pop-up de
 * Google Agenda (« Toutes les semaines le lundi, mardi, jeudi, vendredi, jusqu'au 14 nov. 2026 »).
 *
 * Couvre les répétitions courantes (quotidienne, hebdomadaire avec jours, mensuelle, annuelle,
 * intervalle, fin par date ou par nombre d'occurrences). Toute règle plus exotique retombe sur un
 * « Se répète » générique plutôt que sur une phrase fausse : mieux vaut en dire moins que mentir
 * sur la date de fin d'une série.
 */
export function decrireRecurrence(regles: string[]): string | null {
  const rrule = regles.find((r) => r.startsWith('RRULE:'))
  if (!rrule) return null

  const parties = new Map(
    rrule
      .slice('RRULE:'.length)
      .split(';')
      .map((morceau) => morceau.split('=') as [string, string]),
  )

  const frequence = parties.get('FREQ')
  const intervalle = Number(parties.get('INTERVAL') ?? '1')
  const base: Record<string, [string, string]> = {
    DAILY: ['Tous les jours', `Tous les ${intervalle} jours`],
    WEEKLY: ['Toutes les semaines', `Toutes les ${intervalle} semaines`],
    MONTHLY: ['Tous les mois', `Tous les ${intervalle} mois`],
    YEARLY: ['Tous les ans', `Tous les ${intervalle} ans`],
  }
  if (!frequence || !base[frequence]) return 'Se répète'

  let phrase = intervalle > 1 ? base[frequence][1] : base[frequence][0]

  const jours = parties.get('BYDAY')
  if (frequence === 'WEEKLY' && jours) {
    const noms = jours
      .split(',')
      .map((j) => JOURS_RRULE[j.replace(/^[-+]?\d+/, '')])
      .filter(Boolean)
    if (noms.length > 0) phrase += ` le ${noms.join(', ')}`
  }

  const jusqua = parties.get('UNTIL')
  const nombre = parties.get('COUNT')
  if (jusqua) {
    /* Format compact de la norme iCalendar : 20261114T210000Z, que `new Date` ne sait pas lire. */
    const a = jusqua.slice(0, 4)
    const m = jusqua.slice(4, 6)
    const j = jusqua.slice(6, 8)
    const date = new Date(`${a}-${m}-${j}T00:00:00Z`)
    if (!Number.isNaN(date.getTime())) {
      phrase += `, jusqu'au ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)}`
    }
  } else if (nombre) {
    phrase += `, ${nombre} fois`
  }

  return phrase
}

interface EvenementBrut {
  id?: string
  status?: string
  summary?: string
  description?: string
  location?: string
  colorId?: string
  htmlLink?: string
  recurringEventId?: string
  organizer?: { email?: string; displayName?: string }
  attendees?: { email?: string; displayName?: string; responseStatus?: string; organizer?: boolean; optional?: boolean; self?: boolean }[]
  reminders?: { useDefault?: boolean; overrides?: { method?: string; minutes?: number }[] }
  start?: { dateTime?: string }
  end?: { dateTime?: string }
}

export async function evenementsPersonnels(
  /* Seul le jeton est utilisé : la même lecture sert l'agenda personnel d'une personne et, pour
     un admin dont le compte Google personnel EST celui de l'établissement, l'agenda de
     l'établissement (voir api/google-personnel/evenements.ts). */
  integration: { accessToken: string },
  debut: Date,
  fin: Date,
): Promise<EvenementGoogle[]> {
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
    throw new GoogleError(corps?.error?.message ?? "Google Calendar a refusé la lecture de l'agenda personnel.")
  }

  const corps = (await reponse.json()) as { items?: EvenementBrut[] }
  const items = (corps.items ?? []).filter((e) => e.status !== 'cancelled' && e.start?.dateTime && e.end?.dateTime)

  /* La règle de répétition vit sur l'événement MAÎTRE, pas sur ses occurrences : avec
     `singleEvents=true`, Google détaille la série en instances et aucune ne porte sa `recurrence`.
     Les maîtres sont donc relus à part — une fois par série, pas une fois par occurrence, sinon
     une série hebdomadaire coûterait autant d'appels qu'elle a de semaines affichées. */
  const idsMaitres = [...new Set(items.map((e) => e.recurringEventId).filter((id): id is string => Boolean(id)))]
  const recurrences = new Map<string, string | null>()
  await Promise.all(
    idsMaitres.map(async (id) => {
      const maitre = await fetch(`${CALENDAR_URL}/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${integration.accessToken}` },
      }).catch(() => null)
      if (!maitre?.ok) return
      const corpsMaitre = (await maitre.json().catch(() => null)) as { recurrence?: string[] } | null
      recurrences.set(id, decrireRecurrence(corpsMaitre?.recurrence ?? []))
    }),
  )

  return items.map((e) => ({
    id: e.id ?? crypto.randomUUID(),
    titre: e.summary?.trim() || '(Sans titre)',
    debut: e.start!.dateTime!,
    fin: e.end!.dateTime!,
    description: e.description?.trim() || null,
    lieu: e.location?.trim() || null,
    invites: (e.attendees ?? [])
      .filter((p) => p.email)
      .map((p) => ({
        email: p.email!,
        nom: p.displayName?.trim() || null,
        reponse: p.responseStatus ?? 'needsAction',
        organisateur: Boolean(p.organizer),
        optionnel: Boolean(p.optional),
      })),
    organisateur: e.organizer?.email
      ? { email: e.organizer.email, nom: e.organizer.displayName?.trim() || null }
      : null,
    /* `useDefault` renvoie aux réglages de l'agenda, que l'API ne détaille pas ici : Google
       applique 30 minutes par défaut sur un événement avec invités, ce que le pop-up affiche. */
    rappels: e.reminders?.overrides?.map((r) => r.minutes).filter((m): m is number => typeof m === 'number') ??
      (e.reminders?.useDefault ? [30] : []),
    recurrence: e.recurringEventId ? (recurrences.get(e.recurringEventId) ?? 'Se répète') : null,
    couleur: e.colorId ? (COULEURS_GOOGLE[e.colorId] ?? null) : null,
    lienGoogle: e.htmlLink ?? null,
    recurrent: Boolean(e.recurringEventId),
  }))
}

interface ParamsEvenement {
  titre: string
  description?: string
  debut: string
  dureeMinutes: number
  emailsInvites: string[]
  /* Omis = `jitsi`, le comportement d'avant le 2026-10-09 : un appelant qui n'a pas été revu
     garde donc une salle ouverte à tous plutôt que de se retrouver avec un Meet fermé. */
  fournisseur?: FournisseurVisio
}

function bornes(debut: string, dureeMinutes: number) {
  const depart = new Date(debut)
  const fin = new Date(depart.getTime() + dureeMinutes * 60_000)
  return { start: { dateTime: depart.toISOString() }, end: { dateTime: fin.toISOString() } }
}

/**
 * Bloc d'en-tête placé en tête de description de l'événement Calendar. La mention « aucun compte
 * n'est nécessaire » n'est pas décorative : c'est précisément le problème que la bascule vers
 * Jitsi résout, et les élèves habitués à devoir se connecter à Google doivent le lire.
 */
export function descriptionAvecLienVisio(lienVisio: string, description?: string): string {
  const entete = [
    `Lien de connexion : ${lienVisio}`,
    estLienMeet(lienVisio)
      ? 'Connectez-vous avec l’adresse e-mail à laquelle cette invitation a été envoyée.'
      : "Aucun compte n'est nécessaire : le lien s'ouvre directement dans votre navigateur.",
  ].join('\n')
  const reste = description?.trim()
  return reste ? `${entete}\n\n${reste}` : entete
}

function estLienMeet(lien: string): boolean {
  return lien.startsWith('https://meet.google.com/')
}

/**
 * Demande à Calendar de créer une réunion Meet attachée à l'événement, et renvoie son lien.
 *
 * Deux conditions faciles à manquer : le paramètre `conferenceDataVersion=1` (sans lui, Google
 * ignore silencieusement le bloc `conferenceData` et rend un événement sans visio) et un
 * `requestId` unique par demande — c'est lui qui rend l'appel idempotent côté Google.
 *
 * Renvoie `null` plutôt que de lever quand Meet n'a pas pu être créé : l'appelant retombe alors
 * sur une salle Jitsi. Un compte Workspace peut se voir refuser la création de visio par une
 * règle d'administration du domaine, et une séance sans aucun lien serait bien pire qu'une séance
 * dont le lien n'est pas celui prévu.
 */
/**
 * Dit si l'événement est lisible dans l'agenda du compte actuellement connecté.
 *
 * Sert à repérer les réunions héritées d'un compte Google précédent : un changement de compte
 * laisse leurs événements dans l'ancien agenda, où le nouveau jeton n'a aucun droit. Google répond
 * alors 404, et toute tentative de les modifier échoue sans que la cause soit évidente.
 */
export async function evenementAccessible(integration: IntegrationGoogle, eventId: string): Promise<boolean> {
  const reponse = await fetch(`${CALENDAR_URL}/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${integration.accessToken}` },
  }).catch(() => null)
  return reponse?.ok ?? false
}

export async function lienMeetDeLEvenement(
  integration: IntegrationGoogle,
  eventId: string,
): Promise<string | null> {
  const reponse = await fetch(
    `${CALENDAR_URL}/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${integration.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  )
  if (!reponse.ok) return null

  const corps = (await reponse.json().catch(() => null)) as {
    hangoutLink?: string
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
  } | null
  const parEntryPoint = corps?.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri
  return corps?.hangoutLink ?? parEntryPoint ?? null
}

/**
 * Crée l'événement Calendar et son lien de visioconférence.
 *
 * Le lien n'est plus un lien Meet : Google refuse l'accès à toute personne non connectée à un
 * compte Google dès lors que la réunion est hébergée par un compte Gmail gratuit — celui de
 * l'établissement. Une partie des élèves de HOC n'ont pas de compte Google, et aucune API ne lève
 * cette restriction (celle qui le permettrait, Meet API v2 `accessType: OPEN`, exige Workspace).
 * Le lien est donc une salle Jitsi, générée ici puis portée par l'événement : Calendar continue
 * d'assurer l'agenda et l'envoi des invitations, qui n'ont jamais posé problème.
 *
 * Le lien va dans `location` ET en tête de description. `location` est la source de vérité : les
 * modifications ultérieures d'un événement réécrivent la description, jamais le lieu.
 */
export async function creerEvenementVisio(
  integration: IntegrationGoogle,
  params: ParamsEvenement,
): Promise<{ eventId: string; lienVisio: string; fournisseur: FournisseurVisio }> {
  const lienJitsi = nouveauLienVisio()
  const reponse = await fetch(`${CALENDAR_URL}?sendUpdates=all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${integration.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: params.titre,
      description: descriptionAvecLienVisio(lienJitsi, params.description),
      location: lienJitsi,
      ...bornes(params.debut, params.dureeMinutes),
      attendees: params.emailsInvites.map((email) => ({ email })),
    }),
  })

  const corps = (await reponse.json()) as { id?: string; error?: { message?: string } }
  if (!reponse.ok || !corps.id) {
    throw new GoogleError(corps.error?.message ?? "Google Calendar a refusé la création de l'événement.")
  }

  /* L'événement naît avec la salle Jitsi, et c'est seulement ensuite qu'on tente d'y attacher un
     Meet. Deux appels plutôt qu'un seul : si la création de la visio Google échoue, l'événement
     existe déjà et porte un lien utilisable, au lieu de faire échouer toute la planification pour
     une visio. Les invités ne reçoivent pas deux convocations pour autant — Google regroupe les
     notifications d'un même événement. */
  if (params.fournisseur === 'google_meet') {
    const lienMeet = await lienMeetDeLEvenement(integration, corps.id)
    if (lienMeet) {
      await modifierEvenementVisio(integration, corps.id, { lienVisio: lienMeet, description: params.description })
      return { eventId: corps.id, lienVisio: lienMeet, fournisseur: 'google_meet' }
    }
  }

  return { eventId: corps.id, lienVisio: lienJitsi, fournisseur: 'jitsi' }
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
 * Modifie un événement « autre » existant (voir api/admin/modifier-evenement.ts) : horaire,
 * titre, description et/ou liste d'invités en un seul PATCH, avec `sendUpdates=all` — c'est ce
 * paramètre, déjà utilisé par `creerEvenementVisio`/`deplacerEvenement`, qui fait que Google
 * envoie lui-même une invitation mise à jour à chaque participant : exactement la « nouvelle
 * invitation » demandée par le client le 2026-09-29, sans avoir à écrire de modèle d'e-mail
 * dédié. Plus général que `deplacerEvenement` (horaire seul) : les champs omis dans `params`
 * restent inchangés côté Google (sémantique PATCH), donc un appelant qui ne change QUE l'horaire
 * peut aussi n'en passer que les deux champs concernés.
 */
export async function modifierEvenementVisio(
  integration: IntegrationGoogle,
  eventId: string,
  params: {
    titre?: string
    description?: string
    debut?: string
    dureeMinutes?: number
    emailsInvites?: string[]
    /* Le lien de visioconférence de l'événement, quand l'appelant l'a sous la main. Réécrire la
       description sans lui effacerait l'en-tête qui porte le lien ; le passer ici le réinstalle.
       Fournir ce champ SEUL (sans description) sert au rattrapage des événements créés avant la
       bascule : il remplace le lien Meet de l'événement par la salle Jitsi. */
    lienVisio?: string
  },
): Promise<void> {
  const corps: Record<string, unknown> = {}
  if (params.titre !== undefined) corps.summary = params.titre
  if (params.lienVisio !== undefined) {
    corps.location = params.lienVisio
    corps.description = descriptionAvecLienVisio(params.lienVisio, params.description)
  } else if (params.description !== undefined) {
    corps.description = params.description
  }
  if (params.debut !== undefined && params.dureeMinutes !== undefined) Object.assign(corps, bornes(params.debut, params.dureeMinutes))
  if (params.emailsInvites !== undefined) corps.attendees = params.emailsInvites.map((email) => ({ email }))

  const reponse = await fetch(`${CALENDAR_URL}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${integration.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })
  if (!reponse.ok) {
    const corpsErreur = (await reponse.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new GoogleError(corpsErreur?.error?.message ?? "Google Calendar a refusé la modification de l'événement.")
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
