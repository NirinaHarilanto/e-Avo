import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import {
  integrationDeLEtablissement,
  integrationPersonnelleDeLaPersonne,
  evenementsPersonnels,
  noterErreurGooglePersonnelle,
  GoogleError,
} from '../_lib/google.js'
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

export const config = { runtime: 'edge' }

/**
 * Événements du Google Calendar personnel de l'appelant, pour la fenêtre `debut`/`fin` demandée
 * (0098) — superposés en lecture seule dans son agenda HOC. Jamais d'erreur bloquante : une
 * personne qui n'a rien connecté reçoit simplement une liste vide (c'est l'état normal), et un
 * incident Google (jeton expiré, accès révoqué) renvoie aussi une liste vide plutôt que de casser
 * l'affichage de l'agenda HOC — seule la superposition manque, la trace de l'incident est notée
 * pour l'écran de connexion (Mon profil), comme pour l'intégration d'établissement.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    const url = new URL(request.url)
    const debutParam = url.searchParams.get('debut')
    const finParam = url.searchParams.get('fin')
    if (!debutParam || !finParam) {
      return Response.json({ error: 'Fenêtre de dates manquante.' }, { status: 400 })
    }
    const debut = new Date(debutParam)
    const fin = new Date(finParam)
    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
      return Response.json({ error: 'Fenêtre de dates invalide.' }, { status: 400 })
    }

    const integration = await integrationPersonnelleDeLaPersonne(serviceClient, profileId)
    if (integration) {
      try {
        const evenements = await evenementsPersonnels(integration, debut, fin)
        await noterErreurGooglePersonnelle(serviceClient, profileId, null)
        /* Agenda personnel : lecture seule assumée depuis la migration 0098 — le jeton n'a que le
           scope `calendar.readonly`, et la demande d'origine était explicitement « rien ne part de
           HOC vers Google » pour cette intégration-là. */
        return Response.json({ evenements: evenements.map((e) => ({ ...e, modifiable: false })) })
      } catch (erreurGoogle) {
        await noterErreurGooglePersonnelle(
          serviceClient,
          profileId,
          erreurGoogle instanceof Error ? erreurGoogle.message : 'Lecture de l’agenda personnel impossible.',
        )
        return Response.json({ evenements: [] })
      }
    }

    /* Repli pour l'administrateur : l'agenda Google de l'établissement est le sien (demande du
       2026-10-09 — « l'agenda de l'admin dans l'application n'est pas synchronisé avec le gmail
       admin, alors que le compte est déjà connecté »). Lui demander de reconnecter le MÊME compte
       une seconde fois, au titre de son agenda personnel, n'aurait aucun sens : s'il n'en a pas
       connecté un autre, on lui superpose directement celui de l'établissement.
       Réservé aux admins : un professeur n'a aucun droit de regard sur cet agenda. */
    if (!roles.includes('admin_etablissement')) {
      return Response.json({ evenements: [] })
    }

    const integrationEtablissement = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)
    if (!integrationEtablissement) {
      return Response.json({ evenements: [] })
    }

    try {
      const tous = await evenementsPersonnels(integrationEtablissement, debut, fin)
      const posesParHOC = await identifiantsEvenementsHOC(serviceClient, etablissementId, debut, fin)
      /* Ceux-là sont dans l'agenda de l'établissement, dont le jeton porte `calendar.events` :
         l'admin peut les modifier et les supprimer depuis HOC, séries récurrentes comprises
         depuis que l'écran sait demander « cette occurrence ou toute la série ? ». */
      return Response.json({
        evenements: tous.filter((e) => !posesParHOC.has(e.id)).map((e) => ({ ...e, modifiable: true })),
      })
    } catch {
      return Response.json({ evenements: [] })
    }
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof GoogleError) {
      return Response.json({ evenements: [] })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

/**
 * Identifiants des événements Google que HOC a lui-même posés sur la fenêtre demandée.
 *
 * Indispensable au repli ci-dessus : l'agenda de l'établissement contient AUSSI les séances, les
 * appels diagnostic et les rendez-vous créés depuis l'application, que l'agenda HOC affiche déjà
 * depuis la base. Sans ce filtre, chacun apparaîtrait deux fois dans la grille — une fois comme
 * séance, une fois comme événement Google superposé.
 *
 * Les quatre tables sont interrogées sur la fenêtre, sauf `video_sessions` qui ne porte pas de
 * date : elle passe par les `sessions` de la fenêtre, comme dans api/admin/realigner-visios.ts.
 */
async function identifiantsEvenementsHOC(
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
