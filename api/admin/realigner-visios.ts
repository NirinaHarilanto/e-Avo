import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import {
  creerEvenementVisio,
  domaineVisio,
  evenementAccessible,
  integrationDeLEtablissement,
  integrationHoteReunion,
  lienMeetDeLEvenement,
  modifierEvenementVisio,
  nouveauLienVisio,
  supprimerEvenement,
  type FournisseurVisio,
  type HoteAgenda,
  type HoteReunion,
} from '../_lib/google.js'
import { emailsParticipants } from '../_lib/creerSeance.js'

export const config = { runtime: 'edge' }

const PREFIXE_MEET = 'https://meet.google.com/'

/**
 * Réaligne les réunions en cours et à venir sur les règles en vigueur, au nombre de deux :
 *
 *  - le FOURNISSEUR : Google Meet pour l'individuel et le duo (appels diagnostic, cours,
 *    rendez-vous d'agenda), Jitsi pour le collectif (cours collectifs, sessions de test oral) —
 *    voir `FournisseurVisio` dans `_lib/google.ts` ;
 *  - l'HÔTE, depuis 0107 : la réunion d'un cours doit vivre dans l'agenda Google du PROFESSEUR qui
 *    le donne, pas dans celui de l'établissement. Les séances planifiées avant ce changement sont
 *    donc recréées chez le professeur et retirées de l'agenda de l'établissement, pour que ce soit
 *    lui qui invite ses élèves et que l'admin cesse d'être destinataire d'office.
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

    /* Budget de temps, et non un nombre d'éléments fixe : la fonction tourne en runtime edge, dont
       Vercel coupe l'exécution au-delà de ~25 s. Chaque réunion coûte jusqu'à quatre appels à
       Google (vérifier l'événement, le créer, y attacher Meet, réécrire sa description), soit
       près de deux secondes — au premier essai du client, 14 réunions sur 92 ont été traitées
       avant que la requête ne soit coupée et que l'écran n'affiche « Le réalignement a échoué »,
       alors que le travail avait bel et bien commencé.
       Borner par le temps plutôt que par le nombre reste juste quelle que soit la lenteur de
       Google ce jour-là ; l'appelant rappelle la route tant qu'il reste du travail (`restant`). */
    const echeance = Date.now() + 14_000
    const tempsRestant = () => Date.now() < echeance

    /* Le lien de remplacement dépend de la cible : une salle Jitsi se fabrique hors de Google,
       un lien Meet ne peut naître QUE sur un événement Calendar existant. Sans événement — compte
       Google déconnecté au moment de la création — la réunion retombe donc sur Jitsi, qui reste
       un lien utilisable, plutôt que de rester sans rien.

       `hote` est explicite depuis 0107 : l'événement d'une séance vit dans l'agenda du professeur
       dès qu'il en a connecté un, et seul ce compte peut y attacher un Meet. */
    async function lienPour(
      cible: FournisseurVisio,
      eventId: string | null,
      hote: HoteAgenda | null,
    ): Promise<{ lien: string; fournisseur: FournisseurVisio }> {
      if (cible === 'google_meet' && hote && eventId) {
        const lienMeet = await lienMeetDeLEvenement(hote, eventId).catch(() => null)
        if (lienMeet) return { lien: lienMeet, fournisseur: 'google_meet' }
      }
      return { lien: nouveauLienVisio(), fournisseur: 'jitsi' }
    }

    /* Un hôte par personne, mémorisé : résoudre une intégration coûte un échange de jeton OAuth,
       et une même personne porte en général plusieurs réunions du lot. Sans ce cache, un
       professeur avec vingt séances consommerait vingt allers-retours Google sur un budget total
       de quatorze secondes. `null` est mémorisé aussi — c'est une réponse comme une autre. */
    const hotesParPersonne = new Map<string, HoteReunion | null>()
    async function hotePour(organisateurId: string | null): Promise<HoteReunion | null> {
      const cle = organisateurId ?? '—'
      if (!hotesParPersonne.has(cle)) {
        hotesParPersonne.set(
          cle,
          await integrationHoteReunion(serviceClient, { organisateurId, etablissementId }).catch(() => null),
        )
      }
      return hotesParPersonne.get(cle) ?? null
    }

    // ── Rendez-vous de prospection (appel diagnostic : individuel ou duo) ──────
    const { data: rdv } = await serviceClient
      .from('rendez_vous')
      .select('id, google_event_id, lien_meet, debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .not('lien_meet', 'is', null)
      .gte('debut', plancher)

    const rdvATraiter = (rdv ?? []).filter((l) => enCoursOuAVenir(l.debut, l.duree_minutes) && !conforme(l.lien_meet, 'google_meet'))
    let restant = 0

    for (const ligne of rdvATraiter) {
      if (!tempsRestant()) {
        restant += 1
        continue
      }
      /* Un appel diagnostic est un rendez-vous de l'établissement : son hôte reste le compte
         officiel, pas celui d'un professeur. */
      const { lien, fournisseur } = await lienPour('google_meet', ligne.google_event_id, integration)
      const { error } = await serviceClient.from('rendez_vous').update({ lien_meet: lien }).eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'rendez_vous', id: ligne.id, raison: error.message })
        continue
      }
      rapport.push({ table: 'rendez_vous', id: ligne.id, fournisseur, calendrier: await poser(integration, ligne.google_event_id, lien) })
    }

    // ── Événements d'agenda (admin et professeurs) ────────────────────────────
    /* `cree_par` : l'événement d'un professeur vit dans SON agenda depuis 0107, c'est donc son
       compte qu'il faut présenter à Google — l'établissement y récolterait un 404. */
    const { data: evenements } = await serviceClient
      .from('evenements_admin')
      .select('id, google_event_id, lien_meet, debut, duree_minutes, cree_par')
      .eq('etablissement_id', etablissementId)
      .not('lien_meet', 'is', null)
      .gte('debut', plancher)

    for (const ligne of (evenements ?? []).filter((l) => enCoursOuAVenir(l.debut, l.duree_minutes) && !conforme(l.lien_meet, 'google_meet'))) {
      if (!tempsRestant()) {
        restant += 1
        continue
      }
      const hoteEvenement = await hotePour(ligne.cree_par)
      const { lien, fournisseur } = await lienPour('google_meet', ligne.google_event_id, hoteEvenement)
      const { error } = await serviceClient.from('evenements_admin').update({ lien_meet: lien }).eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'evenements_admin', id: ligne.id, raison: error.message })
        continue
      }
      rapport.push({ table: 'evenements_admin', id: ligne.id, fournisseur, calendrier: await poser(hoteEvenement, ligne.google_event_id, lien) })
    }

    // ── Sessions de test oral (collectif : restent sur Jitsi) ─────────────────
    const { data: creneaux } = await serviceClient
      .from('creneaux_test_positionnement')
      .select('id, google_event_id, lien_visio, debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .not('lien_visio', 'is', null)
      .gte('debut', plancher)

    for (const ligne of (creneaux ?? []).filter((l) => enCoursOuAVenir(l.debut, l.duree_minutes) && !conforme(l.lien_visio, 'jitsi'))) {
      if (!tempsRestant()) {
        restant += 1
        continue
      }
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

    /* Les séances `stub` sont incluses, contrairement à la version du 2026-10-07 qui les écartait :
       ce sont des séances dont la visio n'a JAMAIS pu être créée (aucun compte Google connecté à
       l'époque), donc sans lien du tout. Elles étaient les plus mal loties, et il n'y avait aucune
       raison de les laisser au seul rattrapage manuel, séance par séance, de « Générer le lien ».
       Une séance sans ligne `video_sessions` du tout est traitée de la même façon. */
    /* `organisateur_email` est lu, et pas seulement écrit : c'est lui qui dit quel compte héberge
       la réunion, donc s'il faut la déménager vers l'agenda du professeur (0107). */
    const { data: visios } = await serviceClient
      .from('video_sessions')
      .select('session_id, google_event_id, room_ref, provider, organisateur_email')

    const visioParSeance = new Map((visios ?? []).map((v) => [v.session_id, v]))

    for (const seance of seancesConcernees.values()) {
      const visio = visioParSeance.get(seance.id) ?? null
      const cible: FournisseurVisio = seance.type === 'collectif' ? 'jitsi' : 'google_meet'

      /* Hôte attendu = le professeur de la séance dès qu'il a connecté son compte (0107). Résolu
         AVANT le test de conformité, parce qu'il en fait désormais partie : une réunion dont le
         lien est pourtant du bon type doit quand même être déménagée si elle est hébergée par le
         mauvais compte. C'est ce qui fait de cette route l'outil de bascule des réunions déjà
         planifiées sous l'ancienne règle. Le cache de `hotePour` borne le coût au nombre de
         professeurs concernés, pas au nombre de séances. */
      const hoteSeance = await hotePour(seance.teacher_id)
      /* `organisateur_email` absent = ligne antérieure à son introduction : hôte inconnu, donc
         traitée comme à déménager. Le passage suivant la trouvera conforme (l'adresse est écrite
         au même moment), l'opération reste donc idempotente malgré ce doute initial. */
      const chezLeBonHote = Boolean(visio?.organisateur_email) && visio?.organisateur_email === hoteSeance?.googleEmail
      if (visio && visio.provider !== 'stub' && conforme(visio.room_ref, cible) && chezLeBonHote) continue
      if (!tempsRestant()) {
        restant += 1
        continue
      }

      /* Trois cas mènent à recréer l'événement plutôt qu'à retoucher l'existant :
         - aucun événement Calendar (séance `stub`, ou créée compte Google déconnecté) ;
         - un événement qui appartient à l'agenda d'un compte Google PRÉCÉDENT. Un changement de
           compte (`harionlineclub.app@gmail.com` → `admin@harionlineclub.com`, le 2026-10-09) y
           laisse les réunions déjà planifiées, où le nouveau jeton n'a aucun droit : ni pour
           attacher un Meet, ni pour poser un lien ;
         - un événement hébergé par l'établissement alors que le professeur a désormais le sien
           (0107) : il faut qu'il renaisse dans l'agenda du professeur pour que ce soit lui, et
           non l'admin, qui invite ses élèves. */
      const evenementUtilisable =
        visio?.google_event_id && hoteSeance && chezLeBonHote
          ? await evenementAccessible(hoteSeance, visio.google_event_id)
          : false

      if (!evenementUtilisable && hoteSeance) {
        try {
          const inscrits = await serviceClient.from('session_enrollments').select('student_id').eq('session_id', seance.id)
          const participants = await emailsParticipants(
            serviceClient,
            seance.teacher_id,
            (inscrits.data ?? []).map((i) => i.student_id),
          )
          const cree = await creerEvenementVisio(hoteSeance, {
            titre: participants.titreCours,
            description: 'Cours planifié depuis Hari Online Club.',
            debut: seance.debut,
            dureeMinutes: seance.duree_minutes ?? 60,
            emailsInvites: participants.emails.filter((email) => email !== hoteSeance.googleEmail),
            fournisseur: cible,
          })

          /* L'ancien événement est retiré de l'agenda qui le portait, sinon la réunion y
             resterait en double — l'ancienne occurrence chez l'établissement, la nouvelle chez le
             professeur — et l'agenda de l'admin afficherait deux fois le même cours. Best effort :
             un événement hérité d'un compte Google précédent est inaccessible, il ne peut qu'y
             rester orphelin. */
          if (visio?.google_event_id && integration && visio.google_event_id !== cree.eventId) {
            await supprimerEvenement(integration, visio.google_event_id).catch(() => {})
          }

          const { error } = await serviceClient.from('video_sessions').upsert(
            {
              session_id: seance.id,
              room_ref: cree.lienVisio,
              provider: cree.fournisseur,
              statut: 'planifiee',
              google_event_id: cree.eventId,
              organisateur_email: hoteSeance.googleEmail,
            },
            { onConflict: 'session_id' },
          )
          if (error) {
            echecs.push({ table: 'video_sessions', id: seance.id, raison: error.message })
            continue
          }
          rapport.push({ table: 'video_sessions', id: seance.id, fournisseur: cree.fournisseur, calendrier: 'mis a jour' })
        } catch (erreur) {
          echecs.push({
            table: 'video_sessions',
            id: seance.id,
            raison: erreur instanceof Error ? erreur.message : 'Recréation impossible.',
          })
        }
        continue
      }

      if (!visio) continue

      const { lien, fournisseur } = await lienPour(cible, visio.google_event_id, hoteSeance)
      const { error } = await serviceClient
        .from('video_sessions')
        .update({ room_ref: lien, provider: fournisseur, organisateur_email: hoteSeance?.googleEmail ?? null })
        .eq('session_id', seance.id)
      if (error) {
        echecs.push({ table: 'video_sessions', id: seance.id, raison: error.message })
        continue
      }
      rapport.push({ table: 'video_sessions', id: seance.id, fournisseur, calendrier: await poser(hoteSeance, visio.google_event_id, lien) })
    }

    return Response.json({
      ok: echecs.length === 0,
      basculees: rapport.length,
      versMeet: rapport.filter((r) => r.fournisseur === 'google_meet').length,
      versJitsi: rapport.filter((r) => r.fournisseur === 'jitsi').length,
      /* Nombre de réunions laissées pour le prochain appel, faute de temps. Zéro = terminé. */
      restant,
      compteGoogleConnecte: Boolean(integration),
      rapport,
      echecs,
    })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    /* Le message réel, et non un libellé passe-partout : c'est lui qui aurait dit tout de suite
       que la première tentative butait sur la durée d'exécution, et non sur un refus de Google. */
    return Response.json(
      { error: `Réalignement impossible : ${error instanceof Error ? error.message : 'erreur inconnue'}` },
      { status: 500 },
    )
  }
}

/* Pose le lien sur l'événement Calendar, quand il y en a un : c'est ce qui prévient les
   participants. Une réunion sans événement Google (compte déconnecté au moment de sa création)
   est quand même mise à jour en base — l'application y affichera le bon lien. */
async function poser(
  hote: HoteAgenda | null,
  eventId: string | null,
  lienVisio: string,
): Promise<'mis a jour' | 'non synchronise'> {
  if (!hote || !eventId) return 'non synchronise'
  return modifierEvenementVisio(hote, eventId, { lienVisio })
    .then(() => 'mis a jour' as const)
    .catch(() => 'non synchronise' as const)
}
