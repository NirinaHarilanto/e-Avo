import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import {
  integrationDeLEtablissement,
  integrationHoteReunion,
  modifierEvenementVisio,
  titreEvenement,
  type HoteAgenda,
  type HoteReunion,
} from '../_lib/google.js'
import { emailsParticipants } from '../_lib/creerSeance.js'

export const config = { runtime: 'edge' }

/**
 * Renomme, dans les agendas Google, les séances de cours EN COURS et À VENIR, pour qu'elles
 * portent le format fixé par le client le 2026-11-04 (voir `titreEvenementCours`) :
 * « HOC - Sitrakiniaina » pour un cours individuel ou duo, « HOC - Cours co Intermediate » pour
 * un cours collectif.
 *
 * Pourquoi une route dédiée plutôt qu'un simple changement du code qui crée les événements : ce
 * changement-là ne vaut que pour les séances À NAÎTRE. Les séances déjà planifiées — celles que
 * le client a précisément sous les yeux dans son agenda — gardent leur ancien titre jusqu'à ce
 * que quelque chose les réécrive. `realigner-visios.ts` ne pouvait pas s'en charger : il saute
 * justement les réunions conformes, qui sont ici l'écrasante majorité.
 *
 * Les participants ne sont PAS prévenus (`prevenirParticipants: false`). Le titre est cosmétique :
 * ni l'horaire, ni le lien, ni la liste d'invités ne bougent. Prévenir enverrait une invitation
 * à jour par élève et par séance, soit des centaines d'e-mails pour rien.
 *
 * Idempotente : le titre actuel est lu avant d'écrire, et une séance déjà au bon format n'est pas
 * touchée. Un second appel ne fait donc rien, et le compte rendu le dit.
 *
 * Portée identique à `realigner-visios.ts` : les séances dont la fin n'est pas passée. Renommer
 * un cours déjà donné n'apporte rien.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)

    /* L'agenda de l'ÉTABLISSEMENT, en second recours. Une séance planifiée avant 0107 vit dans
       cet agenda-là, alors que `integrationHoteReunion` rend celui du professeur dès qu'il a
       connecté le sien depuis : viser le professeur donne alors un 404 et la séance resterait au
       vieux titre sans que rien ne le dise. Le client l'a nommé explicitement le 2026-11-04 —
       « ces règles sont valables pour les professeurs ET l'admin dans leurs gmail agenda
       respectifs ». */
    const hoteEtablissement = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)

    /* Même ruse que `realigner-visios.ts` : PostgREST ne sait pas filtrer sur `debut +
       duree_minutes`, on élargit donc de six heures en arrière puis on écarte en mémoire les
       séances réellement terminées. */
    const maintenant = Date.now()
    const plancher = new Date(maintenant - 6 * 60 * 60 * 1000).toISOString()
    const enCoursOuAVenir = (debut: string, dureeMinutes: number | null) =>
      new Date(debut).getTime() + (dureeMinutes ?? 60) * 60_000 > maintenant

    const { data: seances } = await serviceClient
      .from('sessions')
      .select('id, debut, duree_minutes, type, teacher_id, cohort_class_id')
      .eq('etablissement_id', etablissementId)
      .eq('statut', 'planifiee')
      .gte('debut', plancher)
      .order('debut')

    const concernees = (seances ?? []).filter((s) => enCoursOuAVenir(s.debut, s.duree_minutes))

    const { data: visios } = await serviceClient
      .from('video_sessions')
      .select('session_id, google_event_id')
    const eventParSeance = new Map(
      (visios ?? []).filter((v) => v.google_event_id).map((v) => [v.session_id, v.google_event_id as string]),
    )

    /* Les hôtes sont résolus une fois par professeur, et non par séance : chaque résolution coûte
       un échange de jeton OAuth, et un professeur porte en général plusieurs dizaines de séances. */
    const hotes = new Map<string, HoteReunion | null>()
    async function hotePour(teacherId: string): Promise<HoteReunion | null> {
      if (!hotes.has(teacherId)) {
        hotes.set(
          teacherId,
          await integrationHoteReunion(serviceClient, { organisateurId: teacherId, etablissementId }).catch(() => null),
        )
      }
      return hotes.get(teacherId) ?? null
    }

    /* Budget de temps plutôt qu'un nombre fixe de séances : la fonction tourne en runtime edge,
       que Vercel coupe au-delà d'une vingtaine de secondes. L'écran rappelle la route tant que
       `restant` n'est pas nul. */
    const debutExecution = Date.now()
    const tempsRestant = () => Date.now() - debutExecution < 14_000

    let renommees = 0
    let dejaBonnes = 0
    let horsPortee = 0
    let restant = 0
    const echecs: { sessionId: string; raison: string }[] = []

    for (const seance of concernees) {
      const eventId = eventParSeance.get(seance.id)
      /* Pas d'événement Google : la séance existe dans HOC, elle n'a simplement jamais été posée
         dans un agenda (compte déconnecté au moment de sa création). Rien à renommer. */
      if (!eventId) continue

      if (!tempsRestant()) {
        restant += 1
        continue
      }

      const hote = await hotePour(seance.teacher_id)
      if (!hote) continue

      try {
        const inscrits = await serviceClient.from('session_enrollments').select('student_id').eq('session_id', seance.id)
        const participants = await emailsParticipants(
          serviceClient,
          seance.teacher_id,
          (inscrits.data ?? []).map((i) => i.student_id),
          seance,
        )

        /* L'événement est cherché chez le professeur PUIS chez l'établissement : les deux
           agendas portent des séances, selon qu'elles sont nées avant ou après 0107. Le titre
           actuel est relu avant toute écriture — c'est ce qui rend l'opération relançable sans
           repatcher ce qui est déjà au bon format. */
        let porteur: HoteAgenda | null = hote
        let actuel = await titreEvenement(hote, eventId)
        if (actuel === null && hoteEtablissement && hoteEtablissement.googleEmail !== hote.googleEmail) {
          porteur = hoteEtablissement
          actuel = await titreEvenement(hoteEtablissement, eventId)
        }

        /* Toujours illisible : l'événement appartient à un compte Google abandonné (changement
           d'adresse de l'établissement), où aucun jeton actuel n'a de droit. C'est le travail de
           `realigner-visios.ts`, qui le recréera au bon endroit — avec le nouveau titre, puisqu'il
           passe par la même fonction. Ni succès ni échec, donc : simplement hors de portée. */
        if (actuel === null || !porteur) {
          horsPortee += 1
          continue
        }
        if (actuel === participants.titreCours) {
          dejaBonnes += 1
          continue
        }

        await modifierEvenementVisio(porteur, eventId, {
          titre: participants.titreCours,
          prevenirParticipants: false,
        })
        renommees += 1
      } catch (error) {
        echecs.push({ sessionId: seance.id, raison: error instanceof Error ? error.message : 'erreur inconnue' })
      }
    }

    return Response.json({ ok: echecs.length === 0, renommees, dejaBonnes, horsPortee, restant, echecs })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json(
      { error: `Renommage impossible : ${error instanceof Error ? error.message : 'erreur inconnue'}` },
      { status: 500 },
    )
  }
}
