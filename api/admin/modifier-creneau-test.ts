import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerEvenementMeet, deplacerEvenement, integrationDeLEtablissement, noterErreurGoogle } from '../_lib/google.js'
import { messageErreur } from '../_lib/creerSeance.js'
import type { Database } from '../../src/types/database.types.js'

type ChampsCreneau = Database['public']['Tables']['creneaux_test_positionnement']['Update']

export const config = { runtime: 'edge' }

interface Corps {
  creneauId?: string
  debut?: string
  dureeMinutes?: number
  capaciteMax?: number | null
  actif?: boolean
}

/**
 * Modification d'une session de test oral déjà créée (date, durée, places, ouverte/fermée) —
 * demande client du 2026-09-21. Passe par le serveur pour tenir l'événement Google Calendar à
 * jour : un changement de date/durée déplace l'événement (le lien Meet ne change pas) ; si la
 * session n'avait encore aucun lien (Google connecté après coup, ou échec précédent), un
 * événement est créé maintenant — même rattrapage que generer-lien-visio.ts pour les séances.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    if (!corps.creneauId) {
      return Response.json({ error: 'creneauId est requis.' }, { status: 400 })
    }

    const { data: creneau } = await serviceClient
      .from('creneaux_test_positionnement')
      .select('id, etablissement_id, cohort_id, debut, duree_minutes, google_event_id')
      .eq('id', corps.creneauId)
      .maybeSingle()
    if (!creneau || creneau.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Session introuvable.' }, { status: 404 })
    }

    const nouveauDebut = corps.debut ? new Date(corps.debut).toISOString() : creneau.debut
    if (Number.isNaN(new Date(nouveauDebut).getTime())) {
      return Response.json({ error: 'Date invalide.' }, { status: 400 })
    }
    const nouvelleDuree = corps.dureeMinutes ?? creneau.duree_minutes
    if (nouvelleDuree < 5 || nouvelleDuree > 240) {
      return Response.json({ error: 'Durée invalide.' }, { status: 400 })
    }
    const dateOuDureeChangee = nouveauDebut !== creneau.debut || nouvelleDuree !== creneau.duree_minutes

    const champs: ChampsCreneau = { debut: nouveauDebut, duree_minutes: nouvelleDuree }
    if (corps.capaciteMax !== undefined) champs.capacite_max = corps.capaciteMax
    if (corps.actif !== undefined) champs.actif = corps.actif

    const integration = dateOuDureeChangee || !creneau.google_event_id
      ? await integrationDeLEtablissement(serviceClient, etablissementId)
      : null

    if (integration && creneau.google_event_id && dateOuDureeChangee) {
      try {
        await deplacerEvenement(integration, creneau.google_event_id, nouveauDebut, nouvelleDuree)
        await noterErreurGoogle(serviceClient, etablissementId, null)
      } catch (erreurGoogle) {
        await noterErreurGoogle(serviceClient, etablissementId, messageErreur(erreurGoogle))
      }
    } else if (integration && !creneau.google_event_id) {
      // Rattrapage : aucun événement n'existait (Google pas encore connecté à l'ouverture de la
      // session, ou échec de création à l'époque).
      const { data: cohorte } = await serviceClient.from('cohorts').select('nom').eq('id', creneau.cohort_id).maybeSingle()
      try {
        const { eventId, lienMeet } = await creerEvenementMeet(integration, {
          titre: `Test de positionnement — ${cohorte?.nom ?? 'vague'}`,
          description: 'Test oral de positionnement Hari Online Club, généré automatiquement.',
          debut: nouveauDebut,
          dureeMinutes: nouvelleDuree,
          emailsInvites: [],
        })
        champs.google_event_id = eventId
        champs.lien_visio = lienMeet
        await noterErreurGoogle(serviceClient, etablissementId, null)
      } catch (erreurGoogle) {
        await noterErreurGoogle(serviceClient, etablissementId, messageErreur(erreurGoogle))
      }
    }

    const { error } = await serviceClient.from('creneaux_test_positionnement').update(champs).eq('id', creneau.id)
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
