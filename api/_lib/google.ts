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
 * Depuis le 2026-10-09, le compte de l'établissement n'est plus le seul à créer des réunions :
 * CHAQUE PROFESSEUR connecte le sien, et c'est depuis son agenda que partent les séances de ses
 * cours — voir `integrationHoteReunion`, qui choisit l'hôte, et la migration 0107. Le compte de
 * l'établissement reste l'hôte des rendez-vous de l'administration (appels diagnostic, créneaux de
 * test, événements admin) et le repli des professeurs qui n'ont encore rien connecté.
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
/* Agenda Google PERSONNEL (0098) : lecture ET écriture depuis le 2026-10-09 (0107). Il était en
   lecture seule à l'origine — l'intégration ne faisait qu'afficher les événements Google en
   superposition dans l'agenda HOC. Le client a renversé la règle : « chaque professeur doit
   synchroniser son agenda gmail avec son agenda de l'application HOC : mode écriture et read »,
   et c'est désormais depuis le compte du professeur que partent les invitations de ses cours. Même
   scope que l'établissement, donc : `calendar.events` couvre la lecture des événements comme leur
   création (`calendar.readonly` ne servait qu'à restreindre, il n'apportait aucune lecture de
   plus). */
export const SCOPE_GOOGLE_PERSONNEL = SCOPE_GOOGLE

/* Un compte connecté AVANT le 2026-10-09 n'a qu'un jeton en lecture seule : Google n'élargit pas
   un scope sans nouveau consentement. Il faut donc pouvoir distinguer les deux états partout où
   l'on s'apprête à écrire — pour retomber sur le compte de l'établissement plutôt que d'essuyer un
   403, et pour que l'écran demande une reconnexion au lieu d'annoncer une synchronisation qui
   n'existe pas. */
export function peutEcrireDansAgenda(scope: string | null | undefined): boolean {
  return (scope ?? '').split(/\s+/).includes('https://www.googleapis.com/auth/calendar.events')
}

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
export async function signerState(
  type: 'etablissement' | 'personnel',
  /* `adresseAttendue` (2026-10-10) : l'adresse que la personne a CONFIRMÉE dans le pop-up avant de
     partir vers Google. Elle voyage dans l'état signé — donc infalsifiable par le navigateur — et
     le callback refuse l'enregistrement si Google renvoie une autre adresse. Deux raisons : un
     professeur connecté à plusieurs comptes Google dans le même navigateur autorise très
     facilement le mauvais, et chaque compte distinct consomme définitivement une place du quota de
     100 utilisateurs de l'application non vérifiée. */
  donnees: { etablissementId: string; profileId: string; adresseAttendue?: string },
): Promise<string> {
  const charge = versBase64(new TextEncoder().encode(JSON.stringify({ type, ...donnees, emisLe: Date.now() })))
  const signature = await crypto.subtle.sign('HMAC', await cleSignature(), new TextEncoder().encode(charge))
  return `${charge}.${versBase64(new Uint8Array(signature))}`
}

/**
 * Deux adresses désignent-elles le même compte Google ?
 *
 * Insensible à la casse, et — pour gmail.com / googlemail.com uniquement — aux points de la partie
 * locale, que Google ignore officiellement : `irina.stefane@gmail.com` et `irinastefane@gmail.com`
 * sont le MÊME compte. Sans cette règle, la vérification d'adresse rejetterait une saisie
 * parfaitement correcte, et le professeur devrait recommencer — en consommant une seconde place du
 * quota Google pour rien. Les autres domaines sont comparés tels quels : nulle part ailleurs les
 * points ne sont ignorés, et les traiter comme équivalents confondrait deux adresses distinctes.
 */
export function memeAdresseGoogle(a: string | null | undefined, b: string | null | undefined): boolean {
  const normaliser = (valeur: string | null | undefined): string => {
    const brut = (valeur ?? '').trim().toLowerCase()
    const [local, domaine] = brut.split('@')
    if (!domaine) return brut
    if (domaine !== 'gmail.com' && domaine !== 'googlemail.com') return brut
    return `${local.replaceAll('.', '')}@gmail.com`
  }
  const gauche = normaliser(a)
  return gauche !== '' && gauche === normaliser(b)
}

export async function verifierState(state: string): Promise<{
  type: 'etablissement' | 'personnel'
  etablissementId: string
  profileId: string
  adresseAttendue?: string
}> {
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
    adresseAttendue?: string
    emisLe: number
  }
  if (Date.now() - donnees.emisLe > VALIDITE_STATE_MS) {
    throw new GoogleError('Demande de connexion expirée, relancez-la depuis vos paramètres.')
  }
  return {
    type: donnees.type ?? 'etablissement',
    etablissementId: donnees.etablissementId,
    profileId: donnees.profileId,
    adresseAttendue: donnees.adresseAttendue,
  }
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

/**
 * Compte Google qui HÉBERGE un événement : son jeton le crée, le modifie et le supprime, et c'est
 * son adresse qui apparaît comme organisateur aux yeux des invités.
 *
 * Deux comptes différents peuvent tenir ce rôle depuis le 2026-10-09 — celui de l'établissement et
 * celui d'un professeur (0107) — et aucune des fonctions d'écriture ci-dessous n'a besoin de savoir
 * lequel : elles ne lisent que le jeton. C'est ce type minimal qu'elles prennent donc en paramètre,
 * plutôt que `IntegrationGoogle`, pour accepter indifféremment l'un ou l'autre.
 */
export interface HoteAgenda {
  accessToken: string
  googleEmail: string
}

export interface IntegrationGoogle extends HoteAgenda {
  etablissementId: string
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

export interface IntegrationGooglePersonnelle extends HoteAgenda {
  profileId: string
  /* Faux pour un compte connecté avant le 2026-10-09 : son jeton ne porte que `calendar.readonly`
     et Google refusera toute écriture. L'appelant qui veut créer un événement doit le vérifier
     AVANT d'essayer — voir `integrationHoteReunion`. */
  peutEcrire: boolean
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
    .select('profile_id, google_email, refresh_token_chiffre, scope')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!data) return null

  const refreshToken = await dechiffrer(data.refresh_token_chiffre)
  const accessToken = await jetonAcces(refreshToken)
  return { profileId, accessToken, googleEmail: data.google_email, peutEcrire: peutEcrireDansAgenda(data.scope) }
}

export async function noterErreurGooglePersonnelle(serviceClient: ServiceClient, profileId: string, message: string | null) {
  await serviceClient.from('google_integrations_personnelles').update({ derniere_erreur: message }).eq('profile_id', profileId)
}

/* ---------- Qui héberge la réunion d'une séance (0107) ---------- */

/**
 * Hôte d'une réunion, avec de quoi retrouver la ligne où noter un incident : les deux tables
 * d'intégration ont leur propre colonne `derniere_erreur`, et une panne du compte d'un professeur
 * doit s'afficher dans SON écran, pas dans les paramètres de l'établissement.
 */
export type HoteReunion = HoteAgenda &
  ({ type: 'professeur'; profileId: string } | { type: 'etablissement'; etablissementId: string })

/**
 * Choisit le compte Google qui doit héberger une réunion : celui de son organisateur réel.
 *
 * Règle client du 2026-10-09 : « quand un professeur veut organiser une séance de cours [...]
 * l'invitation et la génération de lien se fera à partir de son compte personnel professeur », et
 * cela VAUT AUSSI quand c'est l'admin qui planifie — « quand l'admin planifie les cours d'un
 * étudiant et professeur depuis l'espace admin, les invitations devraient être initiés à partir du
 * compte gmail du professeur ». L'hôte se déduit donc de la séance (son `teacher_id`), jamais de la
 * personne qui clique.
 *
 * Conséquence voulue : l'admin n'est plus organisateur des cours, donc ils n'atterrissent plus
 * d'office dans son agenda Google ni dans sa boîte — « par défaut, l'admin n'est pas censé recevoir
 * automatiquement et systématiquement d'invitation ». Il garde la vue complète des plannings dans
 * « Séances & visio », qui lit la base et non Google.
 *
 * Repli sur le compte de l'établissement quand le professeur n'a rien connecté, n'a qu'un jeton en
 * lecture seule (connecté avant 0107) ou que son jeton est devenu invalide : une séance sans aucun
 * lien de visioconférence serait bien pire qu'une séance dont l'organisateur n'est pas celui
 * prévu. L'incident est noté sur la ligne du professeur, d'où son écran « Mon profil » l'affiche.
 */
export async function integrationHoteReunion(
  serviceClient: ServiceClient,
  /* `organisateurId` est la personne dont la réunion émane — le professeur de la séance, ou
     l'auteur d'un rendez-vous « autre ». Jamais celle qui a cliqué, quand les deux diffèrent. */
  params: { organisateurId?: string | null; etablissementId: string },
): Promise<HoteReunion | null> {
  if (!googleEstConfigure()) return null

  if (params.organisateurId) {
    try {
      const personnelle = await integrationPersonnelleDeLaPersonne(serviceClient, params.organisateurId)
      if (personnelle?.peutEcrire) {
        return {
          type: 'professeur',
          profileId: personnelle.profileId,
          accessToken: personnelle.accessToken,
          googleEmail: personnelle.googleEmail,
        }
      }
      if (personnelle) {
        await noterErreurGooglePersonnelle(
          serviceClient,
          params.organisateurId,
          'Votre compte Google a été connecté en lecture seule : reconnectez-le pour que vos séances soient créées dans votre propre agenda et que vos élèves soient invités depuis votre adresse.',
        )
      }
    } catch (error) {
      /* Jeton révoqué côté Google, ou compte supprimé : on trace et on retombe sur
         l'établissement, sans faire échouer la planification. */
      await noterErreurGooglePersonnelle(serviceClient, params.organisateurId, error instanceof Error ? error.message : 'Connexion Google indisponible.').catch(() => {})
    }
  }

  const etablissement = await integrationDeLEtablissement(serviceClient, params.etablissementId)
  if (!etablissement) return null
  return {
    type: 'etablissement',
    etablissementId: etablissement.etablissementId,
    accessToken: etablissement.accessToken,
    googleEmail: etablissement.googleEmail,
  }
}

/** Note un incident sur la ligne de l'hôte concerné — professeur ou établissement. */
export async function noterErreurHote(serviceClient: ServiceClient, hote: HoteReunion, message: string | null) {
  if (hote.type === 'professeur') {
    await noterErreurGooglePersonnelle(serviceClient, hote.profileId, message)
    return
  }
  await noterErreurGoogle(serviceClient, hote.etablissementId, message)
}

/**
 * Hôte de la réunion d'une séance déjà créée, retrouvé depuis la séance elle-même.
 *
 * Indispensable pour MODIFIER ou SUPPRIMER un événement : il vit dans l'agenda du compte qui l'a
 * créé, et seul ce compte peut y toucher. Viser l'établissement sur un événement hébergé par un
 * professeur donne un 404 silencieux — l'événement reste en place dans son agenda alors que HOC
 * croit l'avoir déplacé.
 */
export async function integrationHoteDeLaSession(
  serviceClient: ServiceClient,
  sessionId: string,
  etablissementId: string,
): Promise<HoteReunion | null> {
  const { data } = await serviceClient.from('sessions').select('teacher_id').eq('id', sessionId).maybeSingle()
  return integrationHoteReunion(serviceClient, { organisateurId: data?.teacher_id ?? null, etablissementId })
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
  recurrent: boolean
  /* Identifiant de l'événement MAÎTRE quand celui-ci est une occurrence de série : c'est lui
     qu'il faut viser pour agir sur toute la série, là où `id` ne touche que cette occurrence. */
  serieId: string | null
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
    serieId: e.recurringEventId ?? null,
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
export async function evenementAccessible(integration: HoteAgenda, eventId: string): Promise<boolean> {
  const reponse = await fetch(`${CALENDAR_URL}/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${integration.accessToken}` },
  }).catch(() => null)
  return reponse?.ok ?? false
}

export async function lienMeetDeLEvenement(
  integration: HoteAgenda,
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
  integration: HoteAgenda,
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
  integration: HoteAgenda,
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
  integration: HoteAgenda,
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
    /* Règle de répétition iCalendar (« RRULE:FREQ=WEEKLY;BYDAY=MO »), posée sur l'événement
       maître d'une série. La chaîne vide retire la répétition, et l'événement redevient ponctuel.
       `undefined` laisse la règle existante intacte, comme tout champ omis d'un PATCH. */
    recurrence?: string
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
  if (params.recurrence !== undefined) corps.recurrence = params.recurrence.trim() ? [params.recurrence.trim()] : []

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
  integration: HoteAgenda,
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

export async function supprimerEvenement(integration: HoteAgenda, eventId: string): Promise<void> {
  const reponse = await fetch(`${CALENDAR_URL}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${integration.accessToken}` },
  })
  // 404/410 : l'événement a déjà disparu côté Google, le résultat voulu est atteint.
  if (!reponse.ok && reponse.status !== 404 && reponse.status !== 410) {
    throw new GoogleError("Google Calendar a refusé la suppression de l'événement.")
  }
}
