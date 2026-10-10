import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import {
  creerEvenementVisio,
  evenementAccessible,
  integrationDeLEtablissement,
  integrationPersonnelleDeLaPersonne,
  noterErreurGooglePersonnelle,
  supprimerEvenement,
  GoogleError,
  type FournisseurVisio,
} from '../_lib/google.js'
import { emailsParticipants } from '../_lib/creerSeance.js'

export const config = { runtime: 'edge' }

/**
 * Fait passer dans l'agenda Google de l'appelant les réunions à venir qui le concernent et qui
 * sont encore hébergées par un autre compte — typiquement celui de l'établissement, qui les a
 * créées avant qu'il ne connecte le sien.
 *
 * Pourquoi cette route existe (exigence client du 2026-10-10) : « pour les futurs professeurs il
 * faut que cela s'affiche du premier coup et la synchronisation se fasse efficacement et
 * rapidement, sans intervention de l'équipe de développement ». Jusqu'ici, un professeur qui
 * connectait son compte voyait bien son agenda apparaître, mais ses cours DÉJÀ planifiés restaient
 * dans l'agenda de l'établissement : il fallait qu'un administrateur pense à cliquer « Mettre à
 * jour les réunions à venir » dans Paramètres (api/admin/realigner-visios.ts) pour que les
 * invitations repartent enfin de son adresse. Elle est donc appelée automatiquement au retour de
 * l'écran de consentement Google (voir IntegrationGoogleCalendarPersonnel.tsx) — le professeur
 * n'a rien à demander à personne.
 *
 * Même opération que la section « Séances de cours » de realigner-visios.ts, mais restreinte à
 * UNE personne, la sienne : elle ne peut donc rien déplacer dans l'agenda d'un collègue, et son
 * coût reste borné au planning d'un seul enseignant. La route d'administration garde son rôle de
 * rattrapage global.
 *
 * Idempotente : une réunion déjà hébergée par le bon compte est ignorée, un second appel ne
 * renvoie donc aucune invitation en double. Bornée par le temps (runtime edge, ~25 s) : l'appelant
 * rappelle la route tant que `restant` n'est pas nul.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireTeacherOrAdmin(request)

    const mien = await integrationPersonnelleDeLaPersonne(serviceClient, profileId).catch(() => null)
    if (!mien) {
      return Response.json(
        { error: "Aucun agenda Google n'est connecté à votre compte. Connectez-le depuis « Mon profil »." },
        { status: 409 },
      )
    }
    if (!mien.peutEcrire) {
      return Response.json(
        {
          error:
            'Votre compte Google est connecté en lecture seule : reconnectez-le en cochant la permission de modification des agendas.',
        },
        { status: 409 },
      )
    }

    /* L'agenda de l'établissement n'est lu que pour RETIRER l'ancienne occurrence : sans cela, le
       même cours resterait affiché deux fois — une fois chez l'établissement, une fois chez le
       professeur. Son absence (compte déconnecté) n'empêche rien, l'ancien événement reste
       simplement orphelin là où il est. */
    const etablissement = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)

    /* Même fenêtre que le réalignement d'administration : tout ce qui n'est pas terminé. Six
       heures de marge en arrière parce que PostgREST ne sait pas comparer `debut + duree`, puis
       tri en mémoire. */
    const maintenant = Date.now()
    const plancher = new Date(maintenant - 6 * 60 * 60 * 1000).toISOString()
    const pasTermine = (debut: string, dureeMinutes: number | null) =>
      new Date(debut).getTime() + (dureeMinutes ?? 60) * 60_000 > maintenant

    const echeance = Date.now() + 14_000
    const tempsRestant = () => Date.now() < echeance

    let adoptees = 0
    let restant = 0
    const echecs: { table: string; id: string; raison: string }[] = []

    // ── Séances de cours dont il est le professeur ────────────────────────────
    const { data: seances } = await serviceClient
      .from('sessions')
      .select('id, debut, duree_minutes, type')
      .eq('etablissement_id', etablissementId)
      .eq('teacher_id', profileId)
      .eq('statut', 'planifiee')
      .gte('debut', plancher)

    const aTraiter = (seances ?? []).filter((s) => pasTermine(s.debut, s.duree_minutes))

    const { data: visios } = aTraiter.length
      ? await serviceClient
          .from('video_sessions')
          .select('session_id, google_event_id, organisateur_email')
          .in(
            'session_id',
            aTraiter.map((s) => s.id),
          )
      : { data: [] }
    const visioParSeance = new Map((visios ?? []).map((v) => [v.session_id, v]))

    for (const seance of aTraiter) {
      const visio = visioParSeance.get(seance.id) ?? null
      /* Déjà chez moi ET l'événement existe encore : rien à faire. L'accessibilité est vérifiée,
         sinon une ligne qui porte mon adresse mais dont l'événement a été supprimé à la main dans
         Gmail resterait éternellement sans réunion. */
      if (visio?.organisateur_email === mien.googleEmail && visio.google_event_id) {
        if (await evenementAccessible(mien, visio.google_event_id).catch(() => false)) continue
      }
      if (!tempsRestant()) {
        restant += 1
        continue
      }

      /* Le collectif reste sur Jitsi (salle ouverte, sans compte requis), l'individuel et le duo
         sur Google Meet — la règle du fournisseur est celle de realigner-visios.ts, inchangée. */
      const cible: FournisseurVisio = seance.type === 'collectif' ? 'jitsi' : 'google_meet'

      try {
        const inscrits = await serviceClient.from('session_enrollments').select('student_id').eq('session_id', seance.id)
        const participants = await emailsParticipants(
          serviceClient,
          profileId,
          (inscrits.data ?? []).map((i) => i.student_id),
        )
        const cree = await creerEvenementVisio(mien, {
          titre: participants.titreCours,
          description: 'Cours planifié depuis Hari Online Club.',
          debut: seance.debut,
          dureeMinutes: seance.duree_minutes ?? 60,
          emailsInvites: participants.emails.filter((email) => email !== mien.googleEmail),
          fournisseur: cible,
        })

        if (visio?.google_event_id && etablissement && visio.google_event_id !== cree.eventId) {
          await supprimerEvenement(etablissement, visio.google_event_id).catch(() => {})
        }

        const { error } = await serviceClient.from('video_sessions').upsert(
          {
            session_id: seance.id,
            room_ref: cree.lienVisio,
            provider: cree.fournisseur,
            statut: 'planifiee',
            google_event_id: cree.eventId,
            organisateur_email: mien.googleEmail,
          },
          { onConflict: 'session_id' },
        )
        if (error) {
          echecs.push({ table: 'video_sessions', id: seance.id, raison: error.message })
          continue
        }
        adoptees += 1
      } catch (erreur) {
        echecs.push({
          table: 'video_sessions',
          id: seance.id,
          raison: erreur instanceof Error ? erreur.message : 'Reprise impossible.',
        })
      }
    }

    // ── Rendez-vous « autre » qu'il a lui-même créés ──────────────────────────
    /* Créés depuis son agenda avant qu'il ne connecte son compte : ils vivent dans l'agenda de
       l'établissement, donc ses invités ont reçu l'invitation de l'administration et non de lui. */
    const { data: evenements } = await serviceClient
      .from('evenements_admin')
      .select('id, titre, debut, duree_minutes, notes, google_event_id, participants_obligatoires, participants_optionnels')
      .eq('etablissement_id', etablissementId)
      .eq('cree_par', profileId)
      .eq('annule', false)
      .gte('debut', plancher)

    const evenementsATraiter = (evenements ?? []).filter((e) => pasTermine(e.debut, e.duree_minutes))

    for (const evenement of evenementsATraiter) {
      if (evenement.google_event_id && (await evenementAccessible(mien, evenement.google_event_id).catch(() => false))) {
        continue
      }
      if (!tempsRestant()) {
        restant += 1
        continue
      }

      try {
        const ids = [...(evenement.participants_obligatoires ?? []), ...(evenement.participants_optionnels ?? [])]
        const { data: personnes } = ids.length
          ? await serviceClient.from('profiles').select('email').in('id', ids)
          : { data: [] }
        const emails = (personnes ?? [])
          .map((p) => p.email)
          .filter((email): email is string => !!email && email !== mien.googleEmail)

        const cree = await creerEvenementVisio(mien, {
          titre: evenement.titre,
          description: evenement.notes ?? undefined,
          debut: evenement.debut,
          dureeMinutes: evenement.duree_minutes ?? 60,
          emailsInvites: emails,
          fournisseur: 'google_meet',
        })

        if (evenement.google_event_id && etablissement && evenement.google_event_id !== cree.eventId) {
          await supprimerEvenement(etablissement, evenement.google_event_id).catch(() => {})
        }

        const { error } = await serviceClient
          .from('evenements_admin')
          .update({ google_event_id: cree.eventId, lien_meet: cree.lienVisio })
          .eq('id', evenement.id)
        if (error) {
          echecs.push({ table: 'evenements_admin', id: evenement.id, raison: error.message })
          continue
        }
        adoptees += 1
      } catch (erreur) {
        echecs.push({
          table: 'evenements_admin',
          id: evenement.id,
          raison: erreur instanceof Error ? erreur.message : 'Reprise impossible.',
        })
      }
    }

    /* La trace d'incident est effacée dès qu'un passage s'est déroulé sans erreur : elle sert à
       l'écran « Mon profil », qui demanderait sinon une reconnexion devenue inutile. */
    if (echecs.length === 0) await noterErreurGooglePersonnelle(serviceClient, profileId, null).catch(() => {})

    return Response.json({ ok: echecs.length === 0, adoptees, restant, echecs, compte: mien.googleEmail })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof GoogleError) {
      return Response.json({ error: error.message }, { status: 502 })
    }
    return Response.json({ error: 'Reprise des réunions impossible.' }, { status: 500 })
  }
}
