/// <reference types="node" />
import { AdminAuthError, requireAdmin } from '../_lib/adminAuth.js'
import { creerEvenementMeet, integrationDeLEtablissement, noterErreurGoogle } from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  titre?: string
  debut?: string
  dureeMinutes?: number
  obligatoiresIds?: string[]
  optionnelsIds?: string[]
  notes?: string
}

/**
 * Création d'un rendez-vous / meeting par l'admin, depuis un créneau libre de son agenda — avec
 * un ou plusieurs étudiants et/ou professeurs déjà inscrits dans l'application (demande client du
 * 2026-09-16), répartis entre participants obligatoires et optionnels (mêmes deux zones que dans
 * Outlook — voir migration 0045 et SelecteurPersonnes.tsx). Distinct de
 * /api/admin/valider-rendez-vous : celui-ci VALIDE une demande de PROSPECT déjà en base, celui-ci
 * CRÉE directement un événement, sans workflow d'attente — l'admin qui le crée l'a par définition
 * déjà décidé.
 *
 * Même tolérance de panne Google que la validation d'un rendez-vous prospect : un incident Google
 * ne fait jamais échouer la création elle-même, l'événement existe avec `lien_meet` à null et
 * l'admin peut réessayer depuis sa fiche.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    const titre = corps.titre?.trim()
    const obligatoiresIds = [...new Set((corps.obligatoiresIds ?? []).filter(Boolean))]
    const optionnelsIds = [...new Set((corps.optionnelsIds ?? []).filter(Boolean))].filter((id) => !obligatoiresIds.includes(id))
    const dureeMinutes = corps.dureeMinutes

    if (!titre) {
      return Response.json({ error: 'Le titre est obligatoire.' }, { status: 400 })
    }
    if (!corps.debut || Number.isNaN(new Date(corps.debut).getTime())) {
      return Response.json({ error: 'Date et heure invalides.' }, { status: 400 })
    }
    if (!dureeMinutes || dureeMinutes < 5 || dureeMinutes > 480) {
      return Response.json({ error: 'Durée invalide.' }, { status: 400 })
    }
    if (obligatoiresIds.length === 0 && optionnelsIds.length === 0) {
      return Response.json({ error: 'Choisissez au moins un participant.' }, { status: 400 })
    }

    // Les participants doivent appartenir au même établissement que l'admin qui crée
    // l'événement — sans ce filtre, rien n'empêcherait d'y glisser l'identifiant d'un profil
    // d'un autre établissement.
    const tousLesIds = [...obligatoiresIds, ...optionnelsIds]
    const { data: participants, error: erreurParticipants } = await serviceClient
      .from('profiles')
      .select('id, nom, prenom, email, role')
      .eq('etablissement_id', etablissementId)
      .in('id', tousLesIds)
    if (erreurParticipants) {
      return Response.json({ error: erreurParticipants.message }, { status: 500 })
    }
    const parId = new Map((participants ?? []).map((p) => [p.id, p]))
    if (tousLesIds.some((id) => !parId.has(id))) {
      return Response.json({ error: 'Un participant est introuvable dans cet établissement.' }, { status: 400 })
    }

    const { data: evenement, error: erreurInsert } = await serviceClient
      .from('evenements_admin')
      .insert({
        etablissement_id: etablissementId,
        titre,
        debut: new Date(corps.debut).toISOString(),
        duree_minutes: dureeMinutes,
        participants_obligatoires: obligatoiresIds,
        participants_optionnels: optionnelsIds,
        notes: corps.notes?.trim() || null,
        cree_par: profileId,
      })
      .select('id')
      .single()
    if (erreurInsert || !evenement) {
      return Response.json({ error: erreurInsert?.message ?? "L'événement n'a pas pu être créé." }, { status: 500 })
    }

    // Lien Meet : au mieux, comme pour rendez_vous — jamais bloquant.
    const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
    let lienMeet: string | null = null
    if (integration) {
      try {
        const emailsInvites = tousLesIds.map((id) => parId.get(id)?.email).filter((email): email is string => !!email)
        const { eventId, lienMeet: lien } = await creerEvenementMeet(integration, {
          titre,
          description: corps.notes?.trim() || undefined,
          debut: new Date(corps.debut).toISOString(),
          dureeMinutes,
          emailsInvites,
        })
        lienMeet = lien
        await serviceClient.from('evenements_admin').update({ google_event_id: eventId, lien_meet: lien }).eq('id', evenement.id)
        await noterErreurGoogle(serviceClient, etablissementId, null)
      } catch (erreurGoogle) {
        await noterErreurGoogle(
          serviceClient,
          etablissementId,
          erreurGoogle instanceof Error ? erreurGoogle.message : 'Échec de création du lien Meet.',
        )
      }
    }

    return Response.json({ id: evenement.id, lienMeet })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
