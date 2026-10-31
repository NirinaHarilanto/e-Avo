import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { empreintesEvenementsHOC, estPoseParHOC } from '../_lib/evenementsHOC.js'
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
 * (0098) — superposés dans son agenda HOC, et modifiables depuis celui-ci dès que son compte a été
 * connecté avec la permission d'écriture (0107). Jamais d'erreur bloquante : une
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

    /* Agendas Google de PROFESSEURS désignés — superposition de l'écran « Séances & visio »
       (demande client du 2026-10-31 : « synchroniser les agendas des professeurs sélectionnés
       avec les agendas des professeurs »). Un professeur voit ses propres indisponibilités Google
       dans son espace ; l'admin, lui, ne voyait que les séances HOC et posait donc des cours sur
       des créneaux déjà pris.
       Réservé aux admins, et borné à LEUR établissement : sans ce second filtre, un identifiant
       saisi à la main ouvrirait l'agenda d'un professeur d'ailleurs. Toujours rendu en lecture
       seule (`modifiable: false`) — l'agenda appartient au professeur, l'admin le consulte. */
    const profileIdsParam = url.searchParams.get('profileIds')
    if (profileIdsParam) {
      if (!roles.includes('admin_etablissement')) {
        return Response.json({ error: 'Réservé à un administrateur.' }, { status: 403 })
      }
      const demandes = [...new Set(profileIdsParam.split(',').map((v) => v.trim()).filter(Boolean))].slice(0, 40)
      if (demandes.length === 0) {
        return Response.json({ evenements: [] })
      }
      const { data: professeurs } = await serviceClient
        .from('profiles')
        .select('id, prenom, nom')
        .eq('etablissement_id', etablissementId)
        .eq('role', 'professeur')
        .in('id', demandes)
      if (!professeurs?.length) {
        return Response.json({ evenements: [] })
      }

      const posesParHOCPourProfs = await empreintesEvenementsHOC(serviceClient, etablissementId, debut, fin)
      const parProfesseur = await Promise.all(
        professeurs.map(async (professeur) => {
          const integrationProfesseur = await integrationPersonnelleDeLaPersonne(serviceClient, professeur.id).catch(() => null)
          if (!integrationProfesseur) return []
          try {
            const evenements = await evenementsPersonnels(integrationProfesseur, debut, fin)
            await noterErreurGooglePersonnelle(serviceClient, professeur.id, null)
            /* Mêmes retraits que pour son propre agenda : les séances posées par HOC y figurent
               déjà en tant que séances, elles feraient doublon dans la grille. */
            return evenements
              .filter((e) => !estPoseParHOC(e, posesParHOCPourProfs))
              .map((e) => ({
                ...e,
                modifiable: false,
                proprietaire: [professeur.prenom, professeur.nom].filter(Boolean).join(' '),
              }))
          } catch (erreurGoogle) {
            /* L'incident est noté sur la ligne du professeur, pour son écran de connexion, mais
               ne fait jamais échouer la lecture des autres agendas demandés. */
            await noterErreurGooglePersonnelle(
              serviceClient,
              professeur.id,
              erreurGoogle instanceof Error ? erreurGoogle.message : 'Lecture de l’agenda personnel impossible.',
            )
            return []
          }
        }),
      )
      return Response.json({ evenements: parProfesseur.flat() })
    }

    const integration = await integrationPersonnelleDeLaPersonne(serviceClient, profileId)
    if (integration) {
      try {
        const evenements = await evenementsPersonnels(integration, debut, fin)
        await noterErreurGooglePersonnelle(serviceClient, profileId, null)
        /* Les séances et rendez-vous que HOC a lui-même posés sont RETIRÉS de la superposition :
           depuis 0107, les cours d'un professeur naissent dans son propre agenda Google, donc sans
           ce filtre chacun apparaîtrait deux fois dans sa grille — une fois comme séance HOC, une
           fois comme événement Google. Même raison et même fonction que pour l'admin plus bas. */
        const posesParHOC = await empreintesEvenementsHOC(serviceClient, etablissementId, debut, fin)
        /* Modifiable depuis HOC si — et seulement si — le jeton porte `calendar.events` (0107).
           Un compte connecté avant ce changement n'a que la lecture : la fiche doit alors montrer
           les informations sans proposer de boutons qui échoueraient. */
        return Response.json({
          evenements: evenements
            .filter((e) => !estPoseParHOC(e, posesParHOC))
            .map((e) => ({ ...e, modifiable: integration.peutEcrire })),
        })
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
      const posesParHOC = await empreintesEvenementsHOC(serviceClient, etablissementId, debut, fin)
      /* Ceux-là sont dans l'agenda de l'établissement, dont le jeton porte `calendar.events` :
         l'admin peut les modifier et les supprimer depuis HOC, séries récurrentes comprises
         depuis que l'écran sait demander « cette occurrence ou toute la série ? ». */
      return Response.json({
        evenements: tous.filter((e) => !estPoseParHOC(e, posesParHOC)).map((e) => ({ ...e, modifiable: true })),
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
