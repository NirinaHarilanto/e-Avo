import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import {
  creerEvenementVisio,
  integrationDeLEtablissement,
  modifierEvenementVisio,
  supprimerEvenement,
  GoogleError,
} from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  eventId?: string
  action?: 'creer' | 'modifier' | 'supprimer'
  /* Création uniquement : adresses des personnes à inviter sur l'événement Google. */
  emailsInvites?: string[]
  titre?: string
  description?: string
  debut?: string
  dureeMinutes?: number
  /* Pour une occurrence de série : « occurrence » ne touche que ce jour-là, « serie » agit sur
     l'événement maître et donc sur toutes ses répétitions — la question que pose Google Agenda
     lui-même quand on modifie un événement récurrent. Ignoré sur un événement ponctuel. */
  portee?: 'occurrence' | 'serie'
  /* Identifiant de l'événement maître, fourni par la lecture (`serieId`). Exigé dès que
     `portee` vaut « serie » : c'est lui qu'on modifie, jamais l'occurrence affichée. */
  serieId?: string
  /* Règle de répétition à poser ou à remplacer, au format iCalendar
     (« RRULE:FREQ=WEEKLY;BYDAY=MO,WE »). Chaîne vide = retirer la répétition. */
  recurrence?: string
}

/**
 * Modifie ou supprime, dans l'agenda Google de l'établissement, un événement qui n'a PAS de
 * contrepartie dans HOC — typiquement un rendez-vous que l'admin a créé depuis Google Agenda et
 * que HOC affiche en superposition (voir api/google-personnel/evenements.ts).
 *
 * Demande client du 2026-10-09 : « on doit pouvoir voir, modifier, supprimer, ajouter un événement
 * depuis l'agenda de l'admin dans l'application HOC et les mises [à jour] se feront
 * instantanément sur l'agenda du compte Google ». Les événements qui viennent de HOC, eux, gardent
 * leurs propres écrans : les modifier ici court-circuiterait la base, qui est leur source de
 * vérité. C'est aussi pourquoi cette route refuse tout identifiant déjà rattaché à une ligne HOC —
 * un garde-fou, pas une simple convention d'appel.
 *
 * Réservée à l'administrateur : l'agenda de l'établissement n'est pas celui d'un professeur, et
 * les agendas Google PERSONNELS restent en lecture seule (scope `calendar.readonly`, 0098).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    /* Création d'un événement RÉCURRENT. Il ne reçoit volontairement aucune ligne
       `evenements_admin` : cette table ne sait pas représenter une répétition, et n'y inscrire que
       la première occurrence ferait apparaître ce jour-là deux fois dans l'agenda — une fois comme
       événement HOC, une fois comme occurrence Google. L'événement vit donc dans Google, qui en
       est la source naturelle, et l'agenda HOC l'affiche par la superposition déjà en place, avec
       sa fiche, ses invités et ses boutons modifier/supprimer. Un événement ponctuel continue de
       passer par api/admin/creer-evenement.ts, qui lui ajoute notifications et participants. */
    if (corps.action === 'creer') {
      if (!corps.titre?.trim() || !corps.debut || Number.isNaN(new Date(corps.debut).getTime()) || !corps.dureeMinutes) {
        return Response.json({ error: 'Titre, date et durée sont obligatoires.' }, { status: 400 })
      }
      if (!corps.recurrence?.trim()) {
        return Response.json({ error: 'Cette route ne crée que des événements qui se répètent.' }, { status: 400 })
      }
      const integrationCreation = await integrationDeLEtablissement(serviceClient, etablissementId)
      if (!integrationCreation) {
        return Response.json(
          { error: "Aucun compte Google n'est connecté : un événement qui se répète ne peut être créé que dans l'agenda Google." },
          { status: 409 },
        )
      }
      const cree = await creerEvenementVisio(integrationCreation, {
        titre: corps.titre.trim(),
        description: corps.description?.trim() || undefined,
        debut: new Date(corps.debut).toISOString(),
        dureeMinutes: corps.dureeMinutes,
        emailsInvites: corps.emailsInvites ?? [],
        fournisseur: 'google_meet',
      })
      await modifierEvenementVisio(integrationCreation, cree.eventId, { recurrence: corps.recurrence.trim() })
      return Response.json({ ok: true, eventId: cree.eventId })
    }

    const occurrenceId = corps.eventId?.trim()
    if (!occurrenceId || (corps.action !== 'modifier' && corps.action !== 'supprimer')) {
      return Response.json({ error: 'Requête incomplète.' }, { status: 400 })
    }

    /* Toute la série : on agit sur l'événement maître, dont la modification se propage à chaque
       occurrence. Sur une seule : on vise l'occurrence affichée, et Google la détache de la série
       sans toucher aux autres. */
    const surLaSerie = corps.portee === 'serie'
    if (surLaSerie && !corps.serieId?.trim()) {
      return Response.json({ error: "Cet événement n'appartient à aucune série." }, { status: 400 })
    }
    const eventId = surLaSerie ? corps.serieId!.trim() : occurrenceId

    if (await appartientAHOC(serviceClient, etablissementId, eventId)) {
      return Response.json(
        { error: 'Cet événement vient de Hari Online Club : modifiez-le depuis sa propre fiche, pas depuis l’agenda Google.' },
        { status: 409 },
      )
    }

    const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
    if (!integration) {
      return Response.json({ error: "Aucun compte Google n'est connecté." }, { status: 409 })
    }

    if (corps.action === 'supprimer') {
      await supprimerEvenement(integration, eventId)
      return Response.json({ ok: true })
    }

    if (!corps.titre?.trim()) {
      return Response.json({ error: 'Le titre est obligatoire.' }, { status: 400 })
    }
    if (corps.debut !== undefined && Number.isNaN(new Date(corps.debut).getTime())) {
      return Response.json({ error: 'Date invalide.' }, { status: 400 })
    }

    await modifierEvenementVisio(integration, eventId, {
      titre: corps.titre.trim(),
      description: corps.description?.trim() || undefined,
      debut: corps.debut,
      dureeMinutes: corps.dureeMinutes,
      /* Une règle de répétition ne vit que sur l'événement maître : la poser sur une occurrence
         détachée n'aurait aucun effet, Google l'ignorerait. */
      recurrence: surLaSerie || !corps.serieId ? corps.recurrence : undefined,
    })
    return Response.json({ ok: true })
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

/* Un identifiant d'événement Google référencé par une ligne HOC appartient à une séance, un
   rendez-vous ou un événement d'agenda : il a son propre écran, avec ses règles (notifications,
   traçabilité, heures décomptées). Le toucher par ce raccourci laisserait la base et Google
   désaccordés. */
async function appartientAHOC(
  serviceClient: Parameters<typeof integrationDeLEtablissement>[0],
  etablissementId: string,
  eventId: string,
): Promise<boolean> {
  const [rdv, evenements, creneaux, visios] = await Promise.all([
    serviceClient.from('rendez_vous').select('id').eq('etablissement_id', etablissementId).eq('google_event_id', eventId).limit(1),
    serviceClient.from('evenements_admin').select('id').eq('etablissement_id', etablissementId).eq('google_event_id', eventId).limit(1),
    serviceClient
      .from('creneaux_test_positionnement')
      .select('id')
      .eq('etablissement_id', etablissementId)
      .eq('google_event_id', eventId)
      .limit(1),
    serviceClient.from('video_sessions').select('session_id').eq('google_event_id', eventId).limit(1),
  ])
  return [rdv.data, evenements.data, creneaux.data, visios.data].some((lot) => (lot ?? []).length > 0)
}
