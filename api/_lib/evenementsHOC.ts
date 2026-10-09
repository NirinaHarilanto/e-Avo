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
 * superposition d'agenda (`identifiantsEvenementsHOC`) et refuser une écriture directe
 * (`appartientAHOC`).
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

/**
 * Identifiants des événements Google que HOC a posés sur la fenêtre demandée.
 *
 * Sans ce filtre, l'agenda HOC afficherait deux fois chaque cours — une fois comme séance lue en
 * base, une fois comme événement Google superposé.
 *
 * Les quatre tables sont interrogées sur la fenêtre, sauf `video_sessions` qui ne porte pas de
 * date : elle passe par les `sessions` de la fenêtre, comme dans api/admin/realigner-visios.ts.
 */
export async function identifiantsEvenementsHOC(
  serviceClient: ServiceClient,
  etablissementId: string,
  debut: Date,
  fin: Date,
): Promise<Set<string>> {
  const debutIso = debut.toISOString()
  const finIso = fin.toISOString()

  const [seances, rdv, evenements, creneaux] = await Promise.all([
    serviceClient.from('sessions').select('id').eq('etablissement_id', etablissementId).gte('debut', debutIso).lte('debut', finIso),
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

  const sessionIds = (seances.data ?? []).map((s) => s.id)
  if (sessionIds.length > 0) {
    const { data: visios } = await serviceClient.from('video_sessions').select('google_event_id').in('session_id', sessionIds)
    for (const visio of visios ?? []) {
      if (visio.google_event_id) ids.add(visio.google_event_id)
    }
  }

  return ids
}
