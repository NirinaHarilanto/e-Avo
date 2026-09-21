/// <reference types="node" />
import { waitUntil } from '@vercel/functions'
import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerEvenementMeet, integrationDeLEtablissement, noterErreurGoogle } from '../_lib/google.js'
import { messageErreur } from '../_lib/creerSeance.js'

export const config = { runtime: 'edge' }

interface Corps {
  cohortId?: string
  debut?: string
  dureeMinutes?: number
  capaciteMax?: number | null
}

/**
 * Ouverture d'une session de test oral — demande client du 2026-09-21 : le lien Google Meet se
 * génère automatiquement, plus de champ à remplir à la main. Passe par le serveur (comme
 * creer-evenement.ts) pour la même raison : la clé service_role et les identifiants Google ne
 * sont accessibles que côté serveur.
 *
 * Même tolérance de panne que les séances de cours : la session existe dès la réponse, le lien
 * Meet arrive en tâche de fond (`waitUntil`) et n'échoue jamais la création elle-même. Sans
 * compte Google connecté, la session reste utilisable, seul le lien reste vide.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    if (!corps.cohortId || !corps.debut || Number.isNaN(new Date(corps.debut).getTime())) {
      return Response.json({ error: 'Vague et date/heure sont obligatoires.' }, { status: 400 })
    }
    const dureeMinutes = corps.dureeMinutes ?? 30
    if (dureeMinutes < 5 || dureeMinutes > 240) {
      return Response.json({ error: 'Durée invalide.' }, { status: 400 })
    }

    const { data: cohorte } = await serviceClient
      .from('cohorts')
      .select('id, nom, etablissement_id')
      .eq('id', corps.cohortId)
      .maybeSingle()
    if (!cohorte || cohorte.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Vague introuvable pour cet établissement.' }, { status: 404 })
    }

    const { data: creneau, error } = await serviceClient
      .from('creneaux_test_positionnement')
      .insert({
        etablissement_id: etablissementId,
        cohort_id: corps.cohortId,
        debut: new Date(corps.debut).toISOString(),
        duree_minutes: dureeMinutes,
        capacite_max: corps.capaciteMax ?? null,
        created_by_profile_id: profileId,
      })
      .select('id, debut, duree_minutes')
      .single()
    if (error || !creneau) {
      return Response.json({ error: error?.message ?? 'La session n’a pas pu être créée.' }, { status: 500 })
    }

    const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
    if (integration) {
      waitUntil(
        (async () => {
          try {
            const { eventId, lienMeet } = await creerEvenementMeet(integration, {
              titre: `Test de positionnement — ${cohorte.nom}`,
              description: 'Test oral de positionnement Hari Online Club, généré automatiquement.',
              debut: creneau.debut,
              dureeMinutes: creneau.duree_minutes,
              /* Les candidats ne sont pas encore connus au moment où l'admin ouvre la session :
                 ils s'inscrivent ensuite depuis la page publique. Le lien leur est transmis par
                 e-mail à l'inscription (api/prospects/inscrire-test.ts), pas par invitation
                 Calendar. */
              emailsInvites: [],
            })
            await serviceClient
              .from('creneaux_test_positionnement')
              .update({ google_event_id: eventId, lien_visio: lienMeet })
              .eq('id', creneau.id)
            await noterErreurGoogle(serviceClient, etablissementId, null)
          } catch (erreurGoogle) {
            await noterErreurGoogle(serviceClient, etablissementId, messageErreur(erreurGoogle))
          }
        })(),
      )
    }

    return Response.json({ id: creneau.id })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
