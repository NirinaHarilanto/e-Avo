/// <reference types="node" />
import { AdminAuthError, requireAdmin } from '../_lib/adminAuth.js'
import { creerEvenementMeet, deplacerEvenement, integrationDeLEtablissement, noterErreurGoogle } from '../_lib/google.js'
import { envoyerEmail, modeleRendezVousConfirme, modeleRendezVousDeplace } from '../_lib/email.js'

export const config = { runtime: 'edge' }

interface Corps {
  prospectId?: string
  debut?: string
  dureeMinutes?: number
}

/**
 * Réservation d'un appel diagnostic par l'admin lui-même, depuis la fenêtre « Planifier un appel
 * diagnostic » (demande client du 2026-09-21) — l'admin choisit un créneau libre dans son propre
 * agenda plutôt que de dépendre de Calendly. Contrairement à `valider-rendez-vous.ts`, il n'y a
 * pas d'étape « en attente » : l'admin qui clique a déjà décidé, le rendez-vous naît directement
 * `confirme`.
 *
 * Si le prospect a déjà un rendez-vous actif (en_attente ou confirme), cet appel le DÉPLACE au
 * lieu d'en créer un second — c'est la même fenêtre qui sert à réserver, modifier et (via
 * annuler-rendez-vous.ts) annuler, l'admin ne choisit jamais explicitement entre ces trois
 * actions, seul l'état actuel du prospect le détermine.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    if (!corps.prospectId || !corps.debut || Number.isNaN(new Date(corps.debut).getTime())) {
      return Response.json({ error: 'Prospect et créneau sont obligatoires.' }, { status: 400 })
    }
    const dureeMinutes = corps.dureeMinutes ?? 15
    if (dureeMinutes < 5 || dureeMinutes > 240) {
      return Response.json({ error: 'Durée invalide.' }, { status: 400 })
    }
    const debut = new Date(corps.debut).toISOString()

    const { data: prospect } = await serviceClient
      .from('prospects')
      .select('id, nom, prenom, email, objectif, langue_visee, type_programme, statut, etablissement_id')
      .eq('id', corps.prospectId)
      .maybeSingle()
    if (!prospect || prospect.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Prospect introuvable pour cet établissement.' }, { status: 404 })
    }

    const { data: etablissement } = await serviceClient.from('etablissements').select('nom').eq('id', etablissementId).maybeSingle()
    const nomEtablissement = etablissement?.nom ?? 'Hari Online Club'
    const { data: parametres } = await serviceClient
      .from('reservation_parametres')
      .select('fuseau')
      .eq('etablissement_id', etablissementId)
      .maybeSingle()
    const quand = new Intl.DateTimeFormat('fr-FR', {
      timeZone: parametres?.fuseau ?? 'Indian/Antananarivo',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(debut))

    const { data: rdvExistant } = await serviceClient
      .from('rendez_vous')
      .select('id, google_event_id, statut')
      .eq('prospect_id', prospect.id)
      .in('statut', ['en_attente', 'confirme'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const integration = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)

    // Déplacement d'un rendez-vous déjà actif : le lien Meet existant est réutilisé, seul
    // l'événement Google bouge — même logique que la reprogrammation d'une séance de cours.
    if (rdvExistant) {
      let eventId = rdvExistant.google_event_id
      let lienMeetActuel: string | null = null

      if (integration && eventId) {
        try {
          await deplacerEvenement(integration, eventId, debut, dureeMinutes)
          await noterErreurGoogle(serviceClient, etablissementId, null)
        } catch (erreurGoogle) {
          await noterErreurGoogle(serviceClient, etablissementId, erreurGoogle instanceof Error ? erreurGoogle.message : 'Déplacement Meet impossible.')
        }
      } else if (integration && !eventId) {
        try {
          const evenement = await creerEvenementMeet(integration, {
            titre: `Appel diagnostic — ${prospect.prenom} ${prospect.nom}`,
            debut,
            dureeMinutes,
            emailsInvites: [prospect.email],
          })
          eventId = evenement.eventId
          lienMeetActuel = evenement.lienMeet
          await noterErreurGoogle(serviceClient, etablissementId, null)
        } catch (erreurGoogle) {
          await noterErreurGoogle(serviceClient, etablissementId, erreurGoogle instanceof Error ? erreurGoogle.message : 'Création Meet impossible.')
        }
      }

      const { data: ligne, error } = await serviceClient
        .from('rendez_vous')
        .update({
          debut,
          duree_minutes: dureeMinutes,
          statut: 'confirme',
          google_event_id: eventId,
          ...(lienMeetActuel ? { lien_meet: lienMeetActuel } : {}),
          valide_par: profileId,
          valide_le: new Date().toISOString(),
        })
        .eq('id', rdvExistant.id)
        .select('lien_meet')
        .single()
      if (error) {
        const conflit = error.code === '23505'
        return Response.json(
          { error: conflit ? 'Ce créneau est déjà occupé par un autre rendez-vous.' : error.message },
          { status: conflit ? 409 : 500 },
        )
      }

      await envoyerEmail({
        destinataire: prospect.email,
        sujet: `Votre appel avec ${nomEtablissement} est déplacé`,
        html: modeleRendezVousDeplace({ prenom: prospect.prenom, etablissement: nomEtablissement, quand, lienMeet: ligne?.lien_meet ?? null }),
      })

      if (prospect.statut === 'prospect') {
        await serviceClient.from('prospects').update({ statut: 'diagnostic_planifie' }).eq('id', prospect.id)
      }

      return Response.json({ ok: true, deplace: true, lienMeet: ligne?.lien_meet ?? null })
    }

    // Nouveau rendez-vous.
    let eventId: string | null = null
    let lienMeet: string | null = null
    if (integration) {
      try {
        const evenement = await creerEvenementMeet(integration, {
          titre: `Appel diagnostic — ${prospect.prenom} ${prospect.nom}`,
          description: [prospect.langue_visee ? `Langue visée : ${prospect.langue_visee}` : null, prospect.objectif ? `Objectif : ${prospect.objectif}` : null]
            .filter(Boolean)
            .join('\n') || undefined,
          debut,
          dureeMinutes,
          emailsInvites: [prospect.email],
        })
        eventId = evenement.eventId
        lienMeet = evenement.lienMeet
        await noterErreurGoogle(serviceClient, etablissementId, null)
      } catch (erreurGoogle) {
        await noterErreurGoogle(serviceClient, etablissementId, erreurGoogle instanceof Error ? erreurGoogle.message : 'Création Meet impossible.')
      }
    }

    const { error } = await serviceClient.from('rendez_vous').insert({
      etablissement_id: etablissementId,
      prospect_id: prospect.id,
      debut,
      duree_minutes: dureeMinutes,
      statut: 'confirme',
      google_event_id: eventId,
      lien_meet: lienMeet,
      valide_par: profileId,
      valide_le: new Date().toISOString(),
    })
    if (error) {
      const conflit = error.code === '23505'
      return Response.json(
        { error: conflit ? 'Ce créneau est déjà occupé par un autre rendez-vous.' : error.message },
        { status: conflit ? 409 : 500 },
      )
    }

    await serviceClient.from('prospects').update({ statut: 'diagnostic_planifie' }).eq('id', prospect.id)

    await envoyerEmail({
      destinataire: prospect.email,
      sujet: `Votre appel avec ${nomEtablissement} est confirmé`,
      html: modeleRendezVousConfirme({ prenom: prospect.prenom, etablissement: nomEtablissement, quand, lienMeet }),
    })

    return Response.json({ ok: true, deplace: false, lienMeet })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
