/// <reference types="node" />
import { AdminAuthError, requireAdmin } from '../_lib/adminAuth.js'
import { creerEvenementMeet, integrationDeLEtablissement, noterErreurGoogle, supprimerEvenement } from '../_lib/google.js'
import { envoyerEmail, modeleRendezVousConfirme, modeleRendezVousRefuse } from '../_lib/email.js'

export const config = { runtime: 'edge' }

interface Corps {
  rendezVousId?: string
  decision?: 'confirmer' | 'refuser'
  motifRefus?: string
}

/**
 * Validation (ou refus) par l'admin d'une demande d'appel diagnostic.
 *
 * À la confirmation seulement, l'événement Google Calendar est créé avec sa visioconférence Meet
 * et le prospect en invité — Google lui envoie alors l'invitation d'agenda, et Resend un message
 * aux couleurs de l'établissement. Créer l'événement dès la demande aurait rempli l'agenda de
 * rendez-vous jamais acceptés.
 *
 * Une panne Google ne fait jamais échouer la confirmation : le rendez-vous passe `confirme` avec
 * `lien_meet` à null, l'incident est tracé, et l'admin peut relancer la génération du lien.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    if (!corps.rendezVousId || (corps.decision !== 'confirmer' && corps.decision !== 'refuser')) {
      return Response.json({ error: 'rendezVousId et decision sont requis.' }, { status: 400 })
    }

    const { data: rendezVous } = await serviceClient
      .from('rendez_vous')
      .select('id, debut, duree_minutes, statut, google_event_id, etablissement_id, prospect_id, prospects(nom, prenom, email, objectif, langue_visee, type_programme)')
      .eq('id', corps.rendezVousId)
      .maybeSingle()

    if (!rendezVous || rendezVous.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Rendez-vous introuvable.' }, { status: 404 })
    }
    if (rendezVous.statut !== 'en_attente') {
      return Response.json({ error: 'Ce rendez-vous a déjà été traité.' }, { status: 409 })
    }

    const prospect = rendezVous.prospects as unknown as {
      nom: string
      prenom: string
      email: string
      objectif: string | null
      langue_visee: string | null
      type_programme: string | null
    } | null
    if (!prospect) {
      return Response.json({ error: 'Prospect introuvable.' }, { status: 404 })
    }

    const { data: etablissement } = await serviceClient
      .from('etablissements')
      .select('nom')
      .eq('id', etablissementId)
      .maybeSingle()
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
    }).format(new Date(rendezVous.debut))

    if (corps.decision === 'refuser') {
      await serviceClient
        .from('rendez_vous')
        .update({
          statut: 'refuse',
          motif_refus: corps.motifRefus?.trim() || null,
          valide_par: profileId,
          valide_le: new Date().toISOString(),
        })
        .eq('id', rendezVous.id)

      /* Le prospect repasse en simple prospect : son créneau est libéré, mais il reste dans le
         pipeline commercial — un refus de créneau n'est pas une perte de contact. */
      await serviceClient.from('prospects').update({ statut: 'prospect' }).eq('id', rendezVous.prospect_id)

      await envoyerEmail({
        destinataire: prospect.email,
        sujet: `Votre créneau avec ${nomEtablissement}`,
        html: modeleRendezVousRefuse({
          prenom: prospect.prenom,
          etablissement: nomEtablissement,
          quand,
          motif: corps.motifRefus?.trim() || null,
        }),
      })

      return Response.json({ ok: true, statut: 'refuse' })
    }

    let eventId: string | null = null
    let lienMeet: string | null = null

    try {
      const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
      if (integration) {
        const details = [
          prospect.langue_visee ? `Langue visée : ${prospect.langue_visee}` : null,
          prospect.type_programme ? `Formule envisagée : ${prospect.type_programme}` : null,
          prospect.objectif ? `Objectif : ${prospect.objectif}` : null,
        ].filter(Boolean)

        const evenement = await creerEvenementMeet(integration, {
          titre: `Appel diagnostic — ${prospect.prenom} ${prospect.nom}`,
          description: details.join('\n') || undefined,
          debut: rendezVous.debut,
          dureeMinutes: rendezVous.duree_minutes,
          emailsInvites: [prospect.email],
        })
        eventId = evenement.eventId
        lienMeet = evenement.lienMeet
        await noterErreurGoogle(serviceClient, etablissementId, null)
      }
    } catch (erreur) {
      await noterErreurGoogle(
        serviceClient,
        etablissementId,
        erreur instanceof Error ? erreur.message : 'Création du lien Meet impossible.',
      )
    }

    const { error: erreurMaj } = await serviceClient
      .from('rendez_vous')
      .update({
        statut: 'confirme',
        google_event_id: eventId,
        lien_meet: lienMeet,
        valide_par: profileId,
        valide_le: new Date().toISOString(),
      })
      .eq('id', rendezVous.id)

    if (erreurMaj) {
      /* La confirmation n'a pas pu être écrite alors que l'événement Google, lui, existe déjà :
         on le retire pour ne pas laisser un rendez-vous fantôme dans l'agenda. */
      if (eventId) {
        const integration = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)
        if (integration) await supprimerEvenement(integration, eventId).catch(() => null)
      }
      return Response.json({ error: erreurMaj.message }, { status: 500 })
    }

    await envoyerEmail({
      destinataire: prospect.email,
      sujet: `Votre appel avec ${nomEtablissement} est confirmé`,
      html: modeleRendezVousConfirme({
        prenom: prospect.prenom,
        etablissement: nomEtablissement,
        quand,
        lienMeet,
      }),
    })

    return Response.json({ ok: true, statut: 'confirme', lienMeet })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
