import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { notifierParticipantsSeance } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Presence {
  studentId: string
  present: boolean
  minutesConnecte?: number
}

interface Corps {
  sessionId?: string
  presences?: Presence[]
  /* Choix à la clôture d'une séance individuel/duo dès qu'au moins un élève est absent (0085,
     demande client du 2026-09-29) — jamais requis pour une séance de vague, dont le décompte ne
     dépend déjà pas de la présence (voir plus bas, comme avant cette migration). Ignoré si
     personne n'est marqué absent : le comportement reste alors celui d'avant, sans rien
     demander. */
  decisionAbsence?: 'reporter' | 'comptabiliser'
  justificatifAbsence?: string
}

// Clôture d'une séance : bascule son statut à "terminee" (ou "reportee", voir plus bas),
// enregistre la présence de chaque élève, puis écrit les écritures d'heures (crédit professeur,
// débit par élève présent). `hour_ledger` n'accepte aucun insert direct depuis le client (voir
// supabase/migrations/0011_hour_ledger.sql, commentaire) — cette clôture est le seul endroit
// où ces écritures sont créées, à partir d'un événement métier réel.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.sessionId || !body.presences) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: session, error: sessionError } = await serviceClient
      .from('sessions')
      .select('*')
      .eq('id', body.sessionId)
      .single()

    if (sessionError || !session || session.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Séance introuvable.' }, { status: 404 })
    }
    if (!roles.includes('admin_etablissement') && session.teacher_id !== profileId) {
      return Response.json({ error: "Cette séance n'est pas la vôtre." }, { status: 403 })
    }
    if (session.statut !== 'planifiee') {
      return Response.json({ error: 'Cette séance est déjà clôturée ou annulée.' }, { status: 409 })
    }

    /* Une séance de vague avance au rythme du groupe (0054, point 10 du 2026-09-23) : une
       absence individuelle n'y remet jamais en cause la séance elle-même, jamais de choix à
       faire ici. Hors vague seulement, donc — mêmes conditions que `debites` plus bas. */
    const auMoinsUnAbsent = !session.cohort_id && body.presences.some((p) => !p.present)
    if (auMoinsUnAbsent) {
      if (body.decisionAbsence !== 'reporter' && body.decisionAbsence !== 'comptabiliser') {
        return Response.json(
          { error: 'Un élève est absent : choisissez de reporter la séance ou de comptabiliser l’heure malgré l’absence.' },
          { status: 400 },
        )
      }
      if (!body.justificatifAbsence?.trim()) {
        return Response.json({ error: 'Un justificatif est obligatoire.' }, { status: 400 })
      }
    }

    for (const presence of body.presences) {
      const { error } = await serviceClient
        .from('session_enrollments')
        .update({ present: presence.present, minutes_connecte: presence.minutesConnecte ?? null })
        .eq('session_id', session.id)
        .eq('student_id', presence.studentId)
      if (error) {
        return Response.json({ error: error.message }, { status: 500 })
      }
    }

    /* « Reporter » (0085) : la séance n'a pas eu lieu, elle est simplement décalée à plus tard —
       aucune heure comptée pour personne, ni le professeur ni l'élève. Distinct de « annulee »
       (qui n'aura JAMAIS lieu) : signalé par son propre statut dans les agendas, comme demandé. */
    const nouveauStatut = auMoinsUnAbsent && body.decisionAbsence === 'reporter' ? 'reportee' : 'terminee'

    const { error: statutError } = await serviceClient
      .from('sessions')
      .update({ statut: nouveauStatut })
      .eq('id', session.id)
    if (statutError) {
      return Response.json({ error: statutError.message }, { status: 500 })
    }

    if (nouveauStatut === 'terminee') {
      const heures = session.duree_minutes / 60
      /* Séance de vague : tous les inscrits sont débités, présents ou non — demande client du
         2026-09-23 (point 10), « le rythme de déduction des forfaits sera le même pour tous les
         étudiants ». Le programme collectif avance au rythme du groupe : une absence ne fait pas
         gagner une heure, elle fait manquer un cours.
         Hors vague : seul le présent est débité, SAUF décision « comptabiliser » (0085) — l'élève
         absent est alors débité comme s'il avait suivi la séance, politique de type « no-show »
         explicitement choisie par le professeur, justificatif à l'appui. */
      const debites =
        session.cohort_id || (auMoinsUnAbsent && body.decisionAbsence === 'comptabiliser')
          ? body.presences.map((p) => p.studentId)
          : body.presences.filter((p) => p.present).map((p) => p.studentId)

      const ecritures = [
        {
          etablissement_id: etablissementId,
          session_id: session.id,
          teacher_id: session.teacher_id,
          type_ecriture: 'credit_professeur' as const,
          heures,
        },
        ...debites.map((studentId) => ({
          etablissement_id: etablissementId,
          session_id: session.id,
          student_id: studentId,
          type_ecriture: 'debit_etudiant' as const,
          heures,
        })),
      ]
      const { error: ledgerError } = await serviceClient.from('hour_ledger').insert(ecritures)
      if (ledgerError) {
        return Response.json({ error: ledgerError.message }, { status: 500 })
      }
    }

    if (auMoinsUnAbsent) {
      // Trace du choix, justificatif compris — même table que les reprogrammations/annulations
      // (0048), un seul historique par séance (voir la migration 0085).
      await serviceClient.from('session_modifications').insert({
        session_id: session.id,
        etablissement_id: etablissementId,
        modifie_par: profileId,
        type_modification: nouveauStatut === 'reportee' ? 'reportee' : 'absence_comptabilisee',
        ancien_debut: session.debut,
        ancienne_duree_minutes: session.duree_minutes,
        justificatif: body.justificatifAbsence!.trim(),
      })

      await notifierParticipantsSeance(serviceClient, {
        etablissementId,
        sessionId: session.id,
        teacherId: session.teacher_id,
        acteurId: profileId,
        type: nouveauStatut === 'reportee' ? 'seance_reportee' : 'absence_comptabilisee',
        titre: nouveauStatut === 'reportee' ? 'Séance reportée' : 'Absence comptabilisée',
        message:
          nouveauStatut === 'reportee'
            ? `La séance sera reprogrammée. Motif : ${body.justificatifAbsence!.trim()}.`
            : `L'heure a été comptabilisée malgré l'absence. Motif : ${body.justificatifAbsence!.trim()}.`,
      })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
