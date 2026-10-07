import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import {
  domaineVisio,
  integrationDeLEtablissement,
  modifierEvenementVisio,
  nouveauLienVisio,
  type IntegrationGoogle,
} from '../_lib/google.js'

export const config = { runtime: 'edge' }

/**
 * Réaligne les réunions sur l'instance de visioconférence courante.
 *
 * Critère : tout lien qui ne pointe pas vers `domaineVisio()`. Volontairement formulé ainsi plutôt
 * qu'en visant meet.google.com, parce que le cas s'est déjà présenté deux fois le même jour — une
 * fois pour quitter Google Meet (ferme aux eleves sans compte Google), une fois pour quitter
 * meet.jit.si (qui s'est mis a exiger un moderateur authentifie). Les liens devenus inutilisables
 * doivent pouvoir etre regeneres quelle qu'en soit l'origine.
 *
 * Le nouveau lien est enregistré en base ET posé sur l'événement Google Calendar correspondant —
 * `sendUpdates=all` fait que Google renvoie lui-même l'invitation à jour à chaque participant, qui
 * reçoit donc le nouveau lien sans qu'on écrive le moindre e-mail.
 *
 * Idempotente et relançable : une réunion déjà sur la bonne instance est ignorée, donc un second
 * appel ne redistribue pas de nouveaux liens aux participants.
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

    /* Inclure les réunions EN COURS suppose de comparer `debut + duree_minutes` à l'instant
       présent, ce que PostgREST ne sait pas exprimer dans un filtre. On élargit donc la requête
       de six heures en arrière — au-delà de toute durée de séance plausible — puis on écarte en
       mémoire celles réellement terminées. */
    const maintenant = Date.now()
    const plancher = new Date(maintenant - 6 * 60 * 60 * 1000).toISOString()
    const enCoursOuAVenir = (debut: string, dureeMinutes: number | null) =>
      new Date(debut).getTime() + (dureeMinutes ?? 60) * 60_000 > maintenant

    const rapport: { table: string; id: string; calendrier: 'mis a jour' | 'non synchronise' }[] = []
    const echecs: { table: string; id: string; raison: string }[] = []

    // ── Rendez-vous de prospection ────────────────────────────────────────────
    const { data: rdv } = await serviceClient
      .from('rendez_vous')
      .select('id, google_event_id, lien_meet, debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .not('lien_meet', 'is', null)
      .not('lien_meet', 'like', `${domaine}%`)
      .gte('debut', plancher)

    for (const ligne of (rdv ?? []).filter((l) => enCoursOuAVenir(l.debut, l.duree_minutes))) {
      const lienVisio = nouveauLienVisio()
      const { error } = await serviceClient.from('rendez_vous').update({ lien_meet: lienVisio }).eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'rendez_vous', id: ligne.id, raison: error.message })
        continue
      }
      const calendrier = await poser(integration, ligne.google_event_id, lienVisio)
      rapport.push({ table: 'rendez_vous', id: ligne.id, calendrier })
    }

    // ── Événements d'agenda (admin et professeurs) ────────────────────────────
    const { data: evenements } = await serviceClient
      .from('evenements_admin')
      .select('id, google_event_id, lien_meet, debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .not('lien_meet', 'is', null)
      .not('lien_meet', 'like', `${domaine}%`)
      .gte('debut', plancher)

    for (const ligne of (evenements ?? []).filter((l) => enCoursOuAVenir(l.debut, l.duree_minutes))) {
      const lienVisio = nouveauLienVisio()
      const { error } = await serviceClient.from('evenements_admin').update({ lien_meet: lienVisio }).eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'evenements_admin', id: ligne.id, raison: error.message })
        continue
      }
      const calendrier = await poser(integration, ligne.google_event_id, lienVisio)
      rapport.push({ table: 'evenements_admin', id: ligne.id, calendrier })
    }

    // ── Sessions de test oral ─────────────────────────────────────────────────
    const { data: creneaux } = await serviceClient
      .from('creneaux_test_positionnement')
      .select('id, google_event_id, lien_visio, debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .not('lien_visio', 'is', null)
      .not('lien_visio', 'like', `${domaine}%`)
      .gte('debut', plancher)

    for (const ligne of (creneaux ?? []).filter((l) => enCoursOuAVenir(l.debut, l.duree_minutes))) {
      const lienVisio = nouveauLienVisio()
      const { error } = await serviceClient
        .from('creneaux_test_positionnement')
        .update({ lien_visio: lienVisio })
        .eq('id', ligne.id)
      if (error) {
        echecs.push({ table: 'creneaux_test_positionnement', id: ligne.id, raison: error.message })
        continue
      }
      const calendrier = await poser(integration, ligne.google_event_id, lienVisio)
      rapport.push({ table: 'creneaux_test_positionnement', id: ligne.id, calendrier })
    }

    // ── Séances de cours ──────────────────────────────────────────────────────
    /* Deux requêtes plutôt qu'une jointure : PostgREST ne reconnaît pas la relation entre
       `video_sessions` et `sessions`, et une jointure non résolue ne lève pas d'erreur — elle
       renvoie simplement zéro ligne, et aucune séance ne serait basculée sans que rien ne le
       signale. */
    const { data: seances } = await serviceClient
      .from('sessions')
      .select('id, debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .eq('statut', 'planifiee')
      .gte('debut', plancher)

    const seancesConcernees = new Map(
      (seances ?? []).filter((s) => enCoursOuAVenir(s.debut, s.duree_minutes)).map((s) => [s.id, s]),
    )

    /* Sur le lien plutôt que sur le `provider` : une séance basculée vers une instance Jitsi
       devenue inutilisable porte `provider = 'jitsi'` tout en ayant besoin d'un nouveau lien.
       Les séances `stub` (aucune visio réelle) sont écartées par le filtre de domaine, leur
       `room_ref` n'étant pas une URL. */
    const { data: visios } = await serviceClient
      .from('video_sessions')
      .select('session_id, google_event_id, room_ref')
      .neq('provider', 'stub')

    const aRegenerer = (visios ?? []).filter(
      (v) => seancesConcernees.has(v.session_id) && !(v.room_ref ?? '').startsWith(domaine),
    )

    for (const visio of aRegenerer) {
      const lienVisio = nouveauLienVisio()
      const { error } = await serviceClient
        .from('video_sessions')
        .update({ room_ref: lienVisio, provider: 'jitsi' })
        .eq('session_id', visio.session_id)
      if (error) {
        echecs.push({ table: 'video_sessions', id: visio.session_id, raison: error.message })
        continue
      }
      const calendrier = await poser(integration, visio.google_event_id, lienVisio)
      rapport.push({ table: 'video_sessions', id: visio.session_id, calendrier })
    }

    return Response.json({
      ok: echecs.length === 0,
      basculees: rapport.length,
      compteGoogleConnecte: Boolean(integration),
      rapport,
      echecs,
    })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Bascule impossible.' }, { status: 500 })
  }
}

/* Pose le lien sur l'événement Calendar, quand il y en a un : c'est ce qui prévient les
   participants. Une réunion sans événement Google (compte déconnecté au moment de sa création)
   bascule quand même en base — l'application y affichera le bon lien. */
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
