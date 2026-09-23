/// <reference types="node" />
import { waitUntil } from '@vercel/functions'
import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
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
 * Création d'un rendez-vous par le professeur depuis son propre agenda, quand il ne s'agit PAS
 * d'une séance de cours (entretien, séance d'information…) — demande client du 2026-09-23 :
 * « exactement comme dans l'espace admin ». Repris quasi à l'identique de
 * api/admin/creer-evenement.ts, seule l'authentification change (professeur ou admin, pas
 * uniquement admin) ; `evenements_admin` reste la même table, l'admin la voit donc aussi dans son
 * propre agenda (policy "evenements_admin_admin_all", 0044) sans rien y ajouter.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    if (!roles.includes('professeur')) {
      return Response.json({ error: 'Réservé à un professeur.' }, { status: 403 })
    }
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

    // Même contrôle que côté admin : les participants doivent appartenir au même établissement
    // que le professeur qui crée l'événement.
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

    // Lien Meet en tâche de fond, jamais bloquant — même logique que creer-evenement.ts admin.
    const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
    if (integration) {
      waitUntil(
        (async () => {
          try {
            const emailsInvites = tousLesIds.map((id) => parId.get(id)?.email).filter((email): email is string => !!email)
            const { eventId, lienMeet } = await creerEvenementMeet(integration, {
              titre,
              description: corps.notes?.trim() || undefined,
              debut: new Date(corps.debut).toISOString(),
              dureeMinutes,
              emailsInvites,
            })
            await serviceClient.from('evenements_admin').update({ google_event_id: eventId, lien_meet: lienMeet }).eq('id', evenement.id)
            await noterErreurGoogle(serviceClient, etablissementId, null)
          } catch (erreurGoogle) {
            await noterErreurGoogle(
              serviceClient,
              etablissementId,
              erreurGoogle instanceof Error ? erreurGoogle.message : 'Échec de création du lien Meet.',
            )
          }
        })(),
      )
    }

    return Response.json({ id: evenement.id, lienMeet: null })
  } catch (erreur) {
    if (erreur instanceof TeacherAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
