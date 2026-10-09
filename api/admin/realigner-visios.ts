import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import {
  creerEvenementVisio,
  domaineVisio,
  evenementAccessible,
  integrationDeLEtablissement,
  lienMeetDeLEvenement,
  modifierEvenementVisio,
  nouveauLienVisio,
  type FournisseurVisio,
  type IntegrationGoogle,
} from '../_lib/google.js'
import { emailsParticipants } from '../_lib/creerSeance.js'

export const config = { runtime: 'edge' }

const PREFIXE_MEET = 'https://meet.google.com/'

/**
 * Réaligne les réunions en cours et à venir sur la règle de fournisseur en vigueur : Google Meet
 * pour l'individuel et le duo (appels diagnostic, cours, rendez-vous d'agenda), Jitsi pour le
 * collectif (cours collectifs, sessions de test oral) — voir `FournisseurVisio` dans
 * `_lib/google.ts`.
 *
 * Remplace la bascule « tout vers Jitsi » du 2026-10-07, qui répondait à un établissement hébergé
 * sur un compte Gmail gratuit. Le compte étant passé à Google Workspace le 2026-10-09, l'individuel
 * repart sur Meet, et cette route sert à rattraper les réunions déjà planifiées sous l'ancienne
 * règle. Elle reste aussi l'outil de secours d'origine : si l'instance Jitsi configurée change
 * (`VISIO_DOMAINE`), les réunions collectives encore sur l'ancienne sont régénérées au passage.
 *
 * Le nouveau lien est enregistré en base ET posé sur l'événement Google Calendar correspondant —
 * `sendUpdates=all` fait que Google renvoie lui-même l'invitation à jour à chaque participant, qui
 * reçoit donc le nouveau lien sans qu'on écrive le moindre e-mail.
 *
 * Idempotente et relançable : une réunion déjà conforme est ignorée, donc un second appel ne
 * redistribue pas de nouveaux liens aux participants.
 *
 * Portée : les réunions EN COURS et À VENIR, c'est-à-dire celles dont la fin n'est pas passée.
 * Une réunion commencée il y a dix minutes et prévue pour une heure est donc traitée — un élève
 * peut encore essayer de la rejoindre. Les réunions terminées sont laissées telles quelles :
 * régénérer le lien d'un cours déjà donné n'apporte rien et enverrait une invitation inutile.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const integration = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)
    const domaine = domaineVisio()

    const conforme = (lien: string | null, cible: FournisseurVisio) =>
      cible === 'google_meet' ? (lien ?? '').startsWith(PREFIXE_MEET) : (lien ?? '').startsWith(domaine)

    /* Inclure les réunions EN COURS suppose de comparer `debut + duree_minutes` à l'instant
       présent, ce que PostgREST ne sait pas exprimer dans un filtre. On élargit donc la requête
       de six heures en arrière — au-delà de toute durée de séance plausible — puis on écarte en
       mémoire celles réellement terminées. */
    const maintenant = Date.now()
    const plancher = new Date(maintenant - 6 * 60 * 60 * 1000).toISOString()
    const enCoursOuAVenir = (debut: string, dureeMinutes: number | null) =>
      new Date(debut).getTime() + (dureeMinutes ?? 60) * 60_000 > maintenant

    const rapport: { table: string; id: string; fournisseur: FournisseurVisio; calendrier: 'mis a jour' | 'non synchronise' }[] = []
    const echecs: { table: string; id: string; raison: string }[] = []

    /* Le lien de remplacement dépend de la cible : une salle Jitsi se fabrique hors de Google,
       un lien Meet ne peut naître QUE sur un événement Calendar existant. Sans événement — compte
       Google déconnecté au moment de la création — la réunion retombe donc sur Jitsi, qui reste
       un lien utilisable, plutôt que de rester sans rien. */
    async function lienPour(cible: FournisseurVisio, eventId: string | null): Promise<{ lien: string; fournisseur: FournisseurVisio }> {
      if (cible === 'google_meet' && integration && eventId) {
        const lienMeet = await lienMeetDeLEvenement(integration, eventId).catch(() => null)
        if (lienMeet) return { lien: lienMeet, fournisseur: 'google_meet' }
      }
      return { lien: nouveauLienVisio(), fournisseur: 'jitsi' }
    }

    // ── Rendez-vous de prospection (appel diagnostic : individuel ou duo) ──────
    const { data: rdv } = await serviceClient
      .from('rendez_vous')
      .select('id, google_event_id, lien_meet, debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .not('lien_meet', 'is', null)
      .gte('debut', plancher)

    for (const ligne of (rdv ?? []).filter((l) => enCoursOuAVenir(l.debut, l.duree_minutes) && !conforme(l.lien_meet, 'google_meet'))) {
      const { lien, fournisseur } = await lienPour('google_meet', ligne.google_event_id)
      const { error } = await serviceClient.from('rendez_vous').update({ lien_meet: lien }).eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'rendez_vous', id: ligne.id, raison: error.message })
        continue
      }
      rapport.push({ table: 'rendez_vous', id: ligne.id, fournisseur, calendrier: await poser(integration, ligne.google_event_id, lien) })
    }

    // ── Événements d'agenda (admin et professeurs) ────────────────────────────
    const { data: evenements } = await serviceClient
      .from('evenements_admin')
      .select('id, google_event_id, lien_meet, debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .not('lien_meet', 'is', null)
      .gte('debut', plancher)

    for (const ligne of (evenements ?? []).filter((l) => enCoursOuAVenir(l.debut, l.duree_minutes) && !conforme(l.lien_meet, 'google_meet'))) {
      const { lien, fournisseur } = await lienPour('google_meet', ligne.google_event_id)
      const { error } = await serviceClient.from('evenements_admin').update({ lien_meet: lien }).eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'evenements_admin', id: ligne.id, raison: error.message })
        continue
      }
      rapport.push({ table: 'evenements_admin', id: ligne.id, fournisseur, calendrier: await poser(integration, ligne.google_event_id, lien) })
    }

    // ── Sessions de test oral (collectif : restent sur Jitsi) ─────────────────
    const { data: creneaux } = await serviceClient
      .from('creneaux_test_positionnement')
      .select('id, google_event_id, lien_visio, debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .not('lien_visio', 'is', null)
      .gte('debut', plancher)

    for (const ligne of (creneaux ?? []).filter((l) => enCoursOuAVenir(l.debut, l.duree_minutes) && !conforme(l.lien_visio, 'jitsi'))) {
      const lien = nouveauLienVisio()
      const { error } = await serviceClient
        .from('creneaux_test_positionnement')
        .update({ lien_visio: lien })
        .eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'creneaux_test_positionnement', id: ligne.id, raison: error.message })
        continue
      }
      rapport.push({ table: 'creneaux_test_positionnement', id: ligne.id, fournisseur: 'jitsi', calendrier: await poser(integration, ligne.google_event_id, lien) })
    }

    // ── Séances de cours ──────────────────────────────────────────────────────
    /* Deux requêtes plutôt qu'une jointure : PostgREST ne reconnaît pas la relation entre
       `video_sessions` et `sessions`, et une jointure non résolue ne lève pas d'erreur — elle
       renvoie simplement zéro ligne, et aucune séance ne serait traitée sans que rien ne le
       signale. C'est aussi `sessions.type` qui décide ici du fournisseur. */
    const { data: seances } = await serviceClient
      .from('sessions')
      .select('id, debut, duree_minutes, type, teacher_id')
      .eq('etablissement_id', etablissementId)
      .eq('statut', 'planifiee')
      .gte('debut', plancher)

    const seancesConcernees = new Map(
      (seances ?? []).filter((s) => enCoursOuAVenir(s.debut, s.duree_minutes)).map((s) => [s.id, s]),
    )

    /* Les séances `stub` (aucune visio réelle n'a pu être créée) sont écartées : sans événement
       Calendar, il n'y a de toute façon rien à réaligner — c'est « Générer le lien » qui les
       reprend, depuis la page Séances. */
    const { data: visios } = await serviceClient
      .from('video_sessions')
      .select('session_id, google_event_id, room_ref')
      .neq('provider', 'stub')

    for (const visio of visios ?? []) {
      const seance = seancesConcernees.get(visio.session_id)
      if (!seance) continue
      const cible: FournisseurVisio = seance.type === 'collectif' ? 'jitsi' : 'google_meet'
      if (conforme(visio.room_ref, cible)) continue

      /* Événement injoignable : il appartient à l'agenda d'un compte Google précédent. Un
         changement de compte (`harionlineclub.app@gmail.com` → `admin@harionlineclub.com`, le
         2026-10-09) laisse les réunions déjà planifiées dans l'ancien agenda, où le nouveau jeton
         n'a aucun droit — ni pour y attacher un Meet, ni pour y poser un lien. Les recréer dans
         l'agenda courant est le seul moyen de les récupérer, et c'est exactement ce que fait
         « Générer le lien » sur une séance isolée. L'ancien événement reste chez l'ancien compte,
         orphelin : inaccessible, il ne peut pas être supprimé d'ici.
         Réservé aux séances de cours : ce sont elles qui portent le volume, et `emailsParticipants`
         sait déjà reconstituer leurs invités. */
      const recreer = visio.google_event_id !== null && integration !== null && !(await evenementAccessible(integration, visio.google_event_id))

      if (recreer && integration) {
        try {
          const inscrits = await serviceClient.from('session_enrollments').select('student_id').eq('session_id', visio.session_id)
          const participants = await emailsParticipants(
            serviceClient,
            seance.teacher_id,
            (inscrits.data ?? []).map((i) => i.student_id),
          )
          const cree = await creerEvenementVisio(integration, {
            titre: participants.titreCours,
            description: 'Cours planifié depuis e-Avo.',
            debut: seance.debut,
            dureeMinutes: seance.duree_minutes ?? 60,
            emailsInvites: participants.emails,
            fournisseur: cible,
          })
          const { error } = await serviceClient
            .from('video_sessions')
            .update({
              room_ref: cree.lienVisio,
              provider: cree.fournisseur,
              google_event_id: cree.eventId,
              organisateur_email: integration.googleEmail,
            })
            .eq('session_id', visio.session_id)
          if (error) {
            echecs.push({ table: 'video_sessions', id: visio.session_id, raison: error.message })
            continue
          }
          rapport.push({ table: 'video_sessions', id: visio.session_id, fournisseur: cree.fournisseur, calendrier: 'mis a jour' })
          continue
        } catch (erreur) {
          echecs.push({
            table: 'video_sessions',
            id: visio.session_id,
            raison: erreur instanceof Error ? erreur.message : 'Recréation impossible.',
          })
          continue
        }
      }

      const { lien, fournisseur } = await lienPour(cible, visio.google_event_id)
      const { error } = await serviceClient
        .from('video_sessions')
        .update({ room_ref: lien, provider: fournisseur })
        .eq('session_id', visio.session_id)
      if (error) {
        echecs.push({ table: 'video_sessions', id: visio.session_id, raison: error.message })
        continue
      }
      rapport.push({ table: 'video_sessions', id: visio.session_id, fournisseur, calendrier: await poser(integration, visio.google_event_id, lien) })
    }

    return Response.json({
      ok: echecs.length === 0,
      basculees: rapport.length,
      versMeet: rapport.filter((r) => r.fournisseur === 'google_meet').length,
      versJitsi: rapport.filter((r) => r.fournisseur === 'jitsi').length,
      compteGoogleConnecte: Boolean(integration),
      rapport,
      echecs,
    })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Réalignement impossible.' }, { status: 500 })
  }
}

/* Pose le lien sur l'événement Calendar, quand il y en a un : c'est ce qui prévient les
   participants. Une réunion sans événement Google (compte déconnecté au moment de sa création)
   est quand même mise à jour en base — l'application y affichera le bon lien. */
async function poser(
  integration: IntegrationGoogle | null,
  eventId: string | null,
  lienVisio: string,
): Promise<'mis a jour' | 'non synchronise'> {
  if (!integration || !eventId) return 'non synchronise'
  return modifierEvenementVisio(integration, eventId, { lienVisio })
    .then(() => 'mis a jour' as const)
    .catch(() => 'non synchronise' as const)
}
