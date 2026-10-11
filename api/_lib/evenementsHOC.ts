/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Reconnaître, dans un agenda Google, ce que HOC y a lui-même posé.
 *
 * Quatre tables portent un `google_event_id` : les séances (via `video_sessions`), les
 * rendez-vous, les événements d'agenda et les créneaux de test de positionnement. Tout ce qui
 * figure dans l'une d'elles a sa propre fiche dans l'application, avec ses règles — notifications,
 * heures décomptées, traçabilité — et la base en est la source de vérité.
 *
 * Deux usages, partagés par les routes de l'admin et celles du professeur depuis 0107, date à
 * laquelle les cours ont commencé à naître dans l'agenda personnel des professeurs : filtrer la
 * superposition d'agenda (`empreintesEvenementsHOC` + `estPoseParHOC`) et refuser une écriture
 * directe (`appartientAHOC`).
 */

/**
 * Un identifiant d'événement Google référencé par une ligne HOC appartient à une séance, un
 * rendez-vous ou un événement d'agenda : il a son propre écran. Le toucher par le raccourci
 * « agenda Google » laisserait la base et Google désaccordés.
 */
export async function appartientAHOC(
  serviceClient: ServiceClient,
  etablissementId: string,
  eventId: string,
): Promise<boolean> {
  const [rdv, evenements, creneaux, visios] = await Promise.all([
    serviceClient.from('rendez_vous').select('id').eq('etablissement_id', etablissementId).eq('google_event_id', eventId).limit(1),
    serviceClient.from('evenements_admin').select('id').eq('etablissement_id', etablissementId).eq('google_event_id', eventId).limit(1),
    serviceClient
      .from('creneaux_test_positionnement')
      .select('id')
      .eq('etablissement_id', etablissementId)
      .eq('google_event_id', eventId)
      .limit(1),
    serviceClient.from('video_sessions').select('session_id').eq('google_event_id', eventId).limit(1),
  ])
  return [rdv.data, evenements.data, creneaux.data, visios.data].some((lot) => (lot ?? []).length > 0)
}

/* Préfixe des titres que HOC donne aux réunions de cours (voir `emailsParticipants` dans
   creerSeance.ts : « Cours · <élèves> · <professeur> »). Sert uniquement au repli ci-dessous. */
const PREFIXE_TITRE_COURS = 'Cours'

export interface EmpreintesHOC {
  /* Identifiants Google enregistrés en base : la reconnaissance exacte, et la seule fiable. */
  ids: Set<string>
  /* Instants de début des séances de la fenêtre, en ISO UTC — base du repli ci-dessous. */
  debutsSeances: Set<string>
}

/**
 * Cet événement Google est-il le reflet d'une ligne HOC ?
 *
 * Fonction pure pour être testable : la comparaison est la partie qui se trompe, pas la lecture.
 *
 * 1. Par IDENTIFIANT, le cas normal et sûr.
 * 2. Par identifiant MAÎTRE : lus avec `singleEvents=true`, les occurrences d'une série portent un
 *    id de la forme `<idMaître>_20261012T180000Z`, qui ne peut jamais être égal à l'id stocké.
 * 3. Par EMPREINTE (même instant de début + titre de cours HOC), repli pour les événements
 *    ORPHELINS : quand une réunion est recréée, l'ancien événement Google n'est pas toujours
 *    supprimé (il l'était avec le jeton de l'établissement alors qu'il appartenait au professeur,
 *    corrigé le 2026-10-11 — mais ceux déjà créés avant restent dans les agendas). La base ne
 *    connaît alors plus que le nouvel identifiant, et l'ancien s'affichait en double à côté de la
 *    séance, signalé par le client le 2026-10-11. Volontairement étroit : il faut un début
 *    STRICTEMENT identique à celui d'une séance ET un titre de réunion de cours. Un événement
 *    personnel qui remplirait ces deux conditions serait de toute façon ce même cours.
 */
export function estPoseParHOC(
  evenement: { id: string; titre: string; debut: string },
  empreintes: EmpreintesHOC,
): boolean {
  if (empreintes.ids.has(evenement.id)) return true

  const separateur = evenement.id.indexOf('_')
  if (separateur > 0 && empreintes.ids.has(evenement.id.slice(0, separateur))) return true

  if (!evenement.titre.startsWith(PREFIXE_TITRE_COURS)) return false
  const debut = new Date(evenement.debut)
  return !Number.isNaN(debut.getTime()) && empreintes.debutsSeances.has(debut.toISOString())
}

/**
 * Empreintes des événements Google que HOC a posés sur la fenêtre demandée.
 *
 * Sans ce filtre, l'agenda HOC afficherait deux fois chaque cours — une fois comme séance lue en
 * base, une fois comme événement Google superposé.
 *
 * Les quatre tables sont interrogées sur la fenêtre, sauf `video_sessions` qui ne porte pas de
 * date : elle passe par les `sessions` de la fenêtre, comme dans api/admin/realigner-visios.ts.
 */
export async function empreintesEvenementsHOC(
  serviceClient: ServiceClient,
  etablissementId: string,
  debut: Date,
  fin: Date,
): Promise<EmpreintesHOC> {
  const debutIso = debut.toISOString()
  const finIso = fin.toISOString()

  const [seances, rdv, evenements, creneaux] = await Promise.all([
    serviceClient.from('sessions').select('id, debut').eq('etablissement_id', etablissementId).gte('debut', debutIso).lte('debut', finIso),
    serviceClient.from('rendez_vous').select('google_event_id').eq('etablissement_id', etablissementId).gte('debut', debutIso).lte('debut', finIso),
    serviceClient.from('evenements_admin').select('google_event_id').eq('etablissement_id', etablissementId).gte('debut', debutIso).lte('debut', finIso),
    serviceClient
      .from('creneaux_test_positionnement')
      .select('google_event_id')
      .eq('etablissement_id', etablissementId)
      .gte('debut', debutIso)
      .lte('debut', finIso),
  ])

  const ids = new Set<string>()
  for (const lot of [rdv.data, evenements.data, creneaux.data]) {
    for (const ligne of lot ?? []) {
      if (ligne.google_event_id) ids.add(ligne.google_event_id)
    }
  }

  /* Normalisés en ISO UTC : Postgres rend « 2026-10-12T18:00:00+00:00 » et Google
     « 2026-10-12T20:00:00+02:00 » pour le même instant — seule cette conversion les rend
     comparables. */
  const debutsSeances = new Set<string>()
  for (const seance of seances.data ?? []) {
    const instant = new Date(seance.debut)
    if (!Number.isNaN(instant.getTime())) debutsSeances.add(instant.toISOString())
  }

  const sessionIds = (seances.data ?? []).map((s) => s.id)
  if (sessionIds.length > 0) {
    const { data: visios } = await serviceClient.from('video_sessions').select('google_event_id').in('session_id', sessionIds)
    for (const visio of visios ?? []) {
      if (visio.google_event_id) ids.add(visio.google_event_id)
    }
  }

  return { ids, debutsSeances }
}
