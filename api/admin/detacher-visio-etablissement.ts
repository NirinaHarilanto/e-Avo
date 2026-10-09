import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { integrationDeLEtablissement, nouveauLienVisio, supprimerEvenement, GoogleError } from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  teacherId?: string
}

/**
 * Détache de l'agenda Google de l'ÉTABLISSEMENT les séances individuelles et duo À VENIR d'un
 * professeur donné, que celui-ci n'a pas encore connecté son propre compte Google (0107) oblige
 * encore à organiser depuis le compte de l'établissement — c'est-à-dire, en pratique, depuis
 * celui de l'admin : son adresse réelle reçoit les invitations, et ces réunions encombrent donc
 * son vrai agenda Gmail.
 *
 * Demande client du 2026-10-10 : « des invitations de séances de cours du professeur [...] ont
 * été envoyées à partir du compte gmail de l'admin et du coup les réunions s'affichent dans
 * l'agenda de l'admin. [...] les séances entre uniquement l'étudiant et le professeur ne sont pas
 * obligatoires pour l'admin donc on peut les supprimer ou annuler et les enlever de l'agenda de
 * l'admin. »
 *
 * Portée délibérément RESTREINTE à UN SEUL professeur à la fois, choisi par l'admin depuis sa
 * fiche (`ProfesseurDetailAdmin.tsx`) — jamais déclenchée d'un coup sur tout l'établissement :
 * au moment où cette route est écrite, AUCUN des professeurs de l'établissement n'a encore
 * connecté son propre agenda, donc une version « tous professeurs confondus » annulerait d'un
 * clic l'intégralité des réunions individuelles à venir de l'établissement — une décision que
 * l'admin doit prendre professeur par professeur, pas que le code prenne à sa place.
 *
 * L'opération SUPPRIME l'événement Google existant (Google envoie lui-même sa notification
 * d'annulation au professeur et à l'élève, c'est le sens de « on peut [...] annuler ») puis
 * remplace le lien par une salle Jitsi fraîche : aucun compte requis pour la rejoindre, donc
 * aucun besoin de recréer un hôte Google. La séance HOC elle-même n'est JAMAIS touchée — ni
 * annulée ni reprogrammée, seule sa visioconférence change de support.
 *
 * Solution de fond, à préférer dès qu'elle est possible : faire connecter au professeur son
 * propre agenda Google (« Mon profil »), puis cliquer « Mettre à jour les réunions à venir »
 * dans Paramètres — qui migre proprement ses séances vers SON compte plutôt que vers Jitsi,
 * avec une nouvelle invitation envoyée depuis sa propre adresse. Cette route-ci est le recours
 * immédiat quand ce n'est pas encore fait.
 *
 * Seules les séances `individuel` sont concernées (le duo est un `individuel` à deux inscrits en
 * base, voir `creerSeanceAvecInscriptions`) : le collectif n'entre jamais dans ce lot, la règle
 * client ne vise explicitement que les séances à deux.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    const teacherId = corps.teacherId?.trim()
    if (!teacherId) {
      return Response.json({ error: 'Professeur manquant.' }, { status: 400 })
    }

    const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
    const emailEtablissement = integration?.googleEmail ?? null

    const { data: seances } = await serviceClient
      .from('sessions')
      .select('id')
      .eq('etablissement_id', etablissementId)
      .eq('teacher_id', teacherId)
      .eq('type', 'individuel')
      .eq('statut', 'planifiee')
      .gte('debut', new Date().toISOString())

    const sessionIds = (seances ?? []).map((s) => s.id)
    if (sessionIds.length === 0) {
      return Response.json({ detachees: 0, restant: 0, echecs: [] })
    }

    const { data: visios } = await serviceClient
      .from('video_sessions')
      .select('session_id, google_event_id, organisateur_email')
      .in('session_id', sessionIds)

    /* Seules les réunions ENCORE hébergées par l'établissement : une séance déjà migrée vers le
       professeur (`organisateur_email` = son adresse, après un réalignement) n'a rien à faire
       ici, et une séance sans aucun événement Google (`stub`, déjà Jitsi) n'a rien à détacher. */
    const aTraiter = (visios ?? []).filter(
      (v) => v.google_event_id && emailEtablissement && v.organisateur_email === emailEtablissement,
    )

    /* Même technique de budget que `realigner-visios.ts` : bornée par le TEMPS, pas par un
       nombre fixe, pour rester juste quelle que soit la lenteur de Google ce jour-là. */
    const echeance = Date.now() + 14_000
    let detachees = 0
    let restant = 0
    const echecs: { sessionId: string; raison: string }[] = []

    for (const visio of aTraiter) {
      if (Date.now() >= echeance) {
        restant += 1
        continue
      }
      try {
        if (integration && visio.google_event_id) {
          // Best effort : l'événement a peut-être déjà disparu côté Google (supprimé à la main).
          await supprimerEvenement(integration, visio.google_event_id).catch(() => {})
        }
        const { error } = await serviceClient
          .from('video_sessions')
          .update({
            provider: 'jitsi',
            room_ref: nouveauLienVisio(),
            google_event_id: null,
            organisateur_email: null,
          })
          .eq('session_id', visio.session_id)
        if (error) {
          echecs.push({ sessionId: visio.session_id, raison: error.message })
          continue
        }
        detachees += 1
      } catch (erreur) {
        echecs.push({
          sessionId: visio.session_id,
          raison: erreur instanceof Error ? erreur.message : 'Erreur Google inconnue.',
        })
      }
    }

    return Response.json({ detachees, restant, echecs })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof GoogleError) {
      return Response.json({ error: error.message }, { status: 502 })
    }
    return Response.json({ error: 'Opération impossible.' }, { status: 500 })
  }
}
