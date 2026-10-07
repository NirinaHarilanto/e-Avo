import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerEvenementVisio, integrationDeLEtablissement, modifierEvenementVisio, noterErreurGoogle } from '../_lib/google.js'
import { messageErreur } from '../_lib/creerSeance.js'
import type { Database } from '../../src/types/database.types.js'

type ChampsCreneau = Database['public']['Tables']['creneaux_test_positionnement']['Update']

export const config = { runtime: 'edge' }

interface Corps {
  creneauId?: string
  /* Rattachement à une autre vague (0100, demande client du 2026-10-06 : « rattachement de vague,
     modifiable par l'utilisateur ») — absent, le rattachement actuel ne change pas. */
  cohortId?: string
  debut?: string
  dureeMinutes?: number
  capaciteMax?: number | null
  actif?: boolean
}

/**
 * Modification d'une session de test oral déjà créée (date, durée, places, ouverte/fermée,
 * vague de rattachement) — demande client du 2026-09-21, complétée le 2026-10-06. Passe par le
 * serveur pour tenir l'événement Google Calendar à jour : un changement de date/durée déplace
 * l'événement (le lien Meet ne change pas) ; un changement de vague renomme le titre de
 * l'événement (il porte le nom de la vague) ; si la session n'avait encore aucun lien (Google
 * connecté après coup, ou échec précédent), un événement est créé maintenant — même rattrapage
 * que generer-lien-visio.ts pour les séances.
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

    // Rattachement à une autre vague : vérifié avant toute écriture, un identifiant inventé ou
    // appartenant à un autre établissement ne doit pas pouvoir rattacher une session ailleurs.
    let nouvelleCohorte: { id: string; nom: string } | null = null
    const cohortChangee = !!corps.cohortId && corps.cohortId !== creneau.cohort_id
    if (cohortChangee) {
      const { data } = await serviceClient
        .from('cohorts')
        .select('id, nom')
        .eq('id', corps.cohortId as string)
        .eq('etablissement_id', etablissementId)
        .maybeSingle()
      if (!data) {
        return Response.json({ error: 'Vague introuvable pour cet établissement.' }, { status: 404 })
      }
      nouvelleCohorte = data
      champs.cohort_id = data.id
    }

    const integration = dateOuDureeChangee || cohortChangee || !creneau.google_event_id
      ? await integrationDeLEtablissement(serviceClient, etablissementId)
      : null

    if (integration && creneau.google_event_id && (dateOuDureeChangee || cohortChangee)) {
      try {
        // Un seul appel, PATCH : seuls les champs fournis changent côté Google — la date/durée si
        // elles ont bougé, le titre (qui porte le nom de la vague) si le rattachement a changé.
        await modifierEvenementVisio(integration, creneau.google_event_id, {
          ...(dateOuDureeChangee ? { debut: nouveauDebut, dureeMinutes: nouvelleDuree } : {}),
          ...(nouvelleCohorte ? { titre: `Test de positionnement — ${nouvelleCohorte.nom}` } : {}),
        })
        await noterErreurGoogle(serviceClient, etablissementId, null)
      } catch (erreurGoogle) {
        await noterErreurGoogle(serviceClient, etablissementId, messageErreur(erreurGoogle))
      }
    } else if (integration && !creneau.google_event_id) {
      // Rattrapage : aucun événement n'existait (Google pas encore connecté à l'ouverture de la
      // session, ou échec de création à l'époque). Le nom de vague à utiliser est le nouveau s'il
      // vient de changer, sinon celui déjà rattaché.
      const { data: cohorte } = nouvelleCohorte
        ? { data: nouvelleCohorte as { nom: string } }
        : await serviceClient.from('cohorts').select('nom').eq('id', creneau.cohort_id).maybeSingle()
      try {
        const { eventId, lienVisio } = await creerEvenementVisio(integration, {
          titre: `Test de positionnement — ${cohorte?.nom ?? 'vague'}`,
          description: 'Test oral de positionnement Hari Online Club, généré automatiquement.',
          debut: nouveauDebut,
          dureeMinutes: nouvelleDuree,
          emailsInvites: [],
        })
        champs.google_event_id = eventId
        champs.lien_visio = lienVisio
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
