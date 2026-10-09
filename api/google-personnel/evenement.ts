import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { appartientAHOC } from '../_lib/evenementsHOC.js'
import {
  creerEvenementVisio,
  integrationPersonnelleDeLaPersonne,
  modifierEvenementVisio,
  noterErreurGooglePersonnelle,
  supprimerEvenement,
  GoogleError,
} from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  eventId?: string
  action?: 'creer' | 'modifier' | 'supprimer'
  emailsInvites?: string[]
  titre?: string
  description?: string
  debut?: string
  dureeMinutes?: number
  /* Pour une occurrence de série : « occurrence » ne touche que ce jour-là, « serie » agit sur
     l'événement maître et donc sur toutes ses répétitions — la question que pose Google Agenda
     lui-même quand on modifie un événement récurrent. Ignoré sur un événement ponctuel. */
  portee?: 'occurrence' | 'serie'
  /* Identifiant de l'événement maître, fourni par la lecture (`serieId`). Exigé dès que `portee`
     vaut « serie » : c'est lui qu'on modifie, jamais l'occurrence affichée. */
  serieId?: string
  /* Règle de répétition au format iCalendar (« RRULE:FREQ=WEEKLY;BYDAY=MO,WE »). Chaîne vide =
     retirer la répétition. */
  recurrence?: string
}

/**
 * Créer, modifier ou supprimer un événement dans l'agenda Google PERSONNEL de l'appelant, depuis
 * son agenda HOC.
 *
 * Demande client du 2026-10-09 (0107) : « chaque professeur doit synchroniser son agenda gmail
 * avec son agenda de l'application HOC : mode écriture et read, avec une synchronisation
 * instantanée et complète ». Le pendant, pour l'agenda de l'établissement, est
 * api/admin/google-evenement.ts — même sémantique, même garde-fou, autre compte.
 *
 * Trois garde-fous, dans cet ordre :
 *   1. l'appelant n'agit QUE sur son propre agenda — l'intégration est lue par son `profileId`,
 *      jamais par un identifiant reçu du navigateur ;
 *   2. le jeton doit porter la permission d'écriture, sinon Google refuserait avec un message
 *      incompréhensible (compte connecté avant 0107, voir `peutEcrire`) ;
 *   3. un événement posé par HOC est refusé : il a sa propre fiche, qui tient la base à jour.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireTeacherOrAdmin(request)
    const corps = (await request.json()) as Corps

    const integration = await integrationPersonnelleDeLaPersonne(serviceClient, profileId)
    if (!integration) {
      return Response.json(
        { error: "Aucun agenda Google n'est connecté à votre compte. Connectez-le depuis « Mon profil »." },
        { status: 409 },
      )
    }
    if (!integration.peutEcrire) {
      return Response.json(
        {
          error:
            'Votre compte Google est connecté en lecture seule. Reconnectez-le depuis « Mon profil » et cochez la permission de modification des agendas pour pouvoir écrire depuis Hari Online Club.',
        },
        { status: 409 },
      )
    }

    /* Création : seuls les événements RÉCURRENTS passent par ici, comme côté admin. Un événement
       ponctuel a sa place dans `evenements_admin` (api/professeur/creer-evenement.ts), qui lui
       ajoute participants et notifications ; une répétition, elle, n'a aucune représentation en
       base et vivrait à moitié dans chaque monde. */
    if (corps.action === 'creer') {
      if (!corps.titre?.trim() || !corps.debut || Number.isNaN(new Date(corps.debut).getTime()) || !corps.dureeMinutes) {
        return Response.json({ error: 'Titre, date et durée sont obligatoires.' }, { status: 400 })
      }
      if (!corps.recurrence?.trim()) {
        return Response.json({ error: 'Cette route ne crée que des événements qui se répètent.' }, { status: 400 })
      }
      const cree = await creerEvenementVisio(integration, {
        titre: corps.titre.trim(),
        description: corps.description?.trim() || undefined,
        debut: new Date(corps.debut).toISOString(),
        dureeMinutes: corps.dureeMinutes,
        emailsInvites: (corps.emailsInvites ?? []).filter((email) => email !== integration.googleEmail),
        fournisseur: 'google_meet',
      })
      await modifierEvenementVisio(integration, cree.eventId, { recurrence: corps.recurrence.trim() })
      await noterErreurGooglePersonnelle(serviceClient, profileId, null)
      return Response.json({ ok: true, eventId: cree.eventId })
    }

    const occurrenceId = corps.eventId?.trim()
    if (!occurrenceId || (corps.action !== 'modifier' && corps.action !== 'supprimer')) {
      return Response.json({ error: 'Requête incomplète.' }, { status: 400 })
    }

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
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof GoogleError) {
      return Response.json({ error: error.message }, { status: 502 })
    }
    return Response.json({ error: 'Opération impossible.' }, { status: 500 })
  }
}
