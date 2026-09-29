import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { adminsDeLEtablissement } from '../_lib/reservation.js'
import { creerNotification } from '../_lib/notifications.js'
import { numeroSuivant } from '../_lib/numerotation.js'
import type { LigneTimesheet } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

interface Corps {
  periodeDebut?: string
  periodeFin?: string
  hourLedgerIds?: string[]
  commentaire?: string
}

/**
 * Envoi d'un TimeSheet à l'administration (0081, demande client du 2026-09-29). Le professeur
 * choisit ses heures clôturées et non payées d'une période ; elles lui sont réservées le temps
 * de la validation pour qu'aucune ne figure sur deux relevés.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    if (!roles.includes('professeur')) {
      return Response.json({ error: 'Réservé aux professeurs.' }, { status: 403 })
    }
    const corps = (await request.json()) as Corps
    if (!corps.periodeDebut || !corps.periodeFin || !corps.hourLedgerIds?.length) {
      return Response.json({ error: 'Période et heures à déclarer sont obligatoires.' }, { status: 400 })
    }
    if (corps.periodeFin < corps.periodeDebut) {
      return Response.json({ error: 'La fin de période précède son début.' }, { status: 400 })
    }

    const { data: ecritures } = await serviceClient
      .from('hour_ledger')
      .select('id, heures, session_id, teacher_id, etablissement_id, type_ecriture, teacher_payment_id, timesheet_id')
      .in('id', corps.hourLedgerIds)
    const valides = (ecritures ?? []).filter(
      (e) =>
        e.teacher_id === profileId &&
        e.etablissement_id === etablissementId &&
        e.type_ecriture === 'credit_professeur' &&
        e.teacher_payment_id === null &&
        e.timesheet_id === null,
    )
    if (valides.length !== corps.hourLedgerIds.length) {
      return Response.json({ error: 'Certaines heures sont déjà payées ou déjà déclarées sur un autre TimeSheet. Rechargez la page.' }, { status: 409 })
    }

    const sessionIds = [...new Set(valides.map((e) => e.session_id))]
    const [{ data: seances }, { data: inscriptions }, { data: professeur }] = await Promise.all([
      serviceClient.from('sessions').select('id, debut').in('id', sessionIds),
      serviceClient.from('session_enrollments').select('session_id, student_id').in('session_id', sessionIds),
      serviceClient.from('profiles').select('prenom, nom, taux_horaire').eq('id', profileId).single(),
    ])
    const eleveIds = [...new Set((inscriptions ?? []).map((i) => i.student_id))]
    const { data: eleves } = eleveIds.length
      ? await serviceClient.from('profiles').select('id, prenom, nom').in('id', eleveIds)
      : { data: [] as { id: string; prenom: string | null; nom: string | null }[] }
    const nomEleve = new Map((eleves ?? []).map((e) => [e.id, [e.prenom, e.nom].filter(Boolean).join(' ')]))
    const debutSeance = new Map((seances ?? []).map((s) => [s.id, s.debut]))

    const lignes: LigneTimesheet[] = valides
      .map((e) => ({
        hour_ledger_id: e.id,
        session_id: e.session_id,
        debut: debutSeance.get(e.session_id) ?? null,
        eleves: (inscriptions ?? [])
          .filter((i) => i.session_id === e.session_id)
          .map((i) => nomEleve.get(i.student_id) ?? 'Élève')
          .join(', '),
        heures: Number(e.heures),
      }))
      .sort((a, b) => (a.debut ?? '').localeCompare(b.debut ?? ''))

    const totalHeures = Math.round(lignes.reduce((t, l) => t + l.heures, 0) * 100) / 100
    const taux = professeur?.taux_horaire ?? null
    const numero = await numeroSuivant(serviceClient, 'timesheets', 'TS', etablissementId)

    const { data: timesheet, error } = await serviceClient
      .from('timesheets')
      .insert({
        etablissement_id: etablissementId,
        teacher_id: profileId,
        numero,
        periode_debut: corps.periodeDebut,
        periode_fin: corps.periodeFin,
        total_heures: totalHeures,
        taux_horaire: taux,
        montant: taux ? Math.round(totalHeures * taux * 100) / 100 : null,
        lignes,
        commentaire: corps.commentaire?.trim() || null,
      })
      .select('id, numero')
      .single()
    if (error || !timesheet) {
      return Response.json({ error: error?.message ?? 'Le TimeSheet n’a pas pu être enregistré.' }, { status: 500 })
    }

    const { error: reservation } = await serviceClient
      .from('hour_ledger')
      .update({ timesheet_id: timesheet.id })
      .in('id', valides.map((e) => e.id))
      .is('timesheet_id', null)
    if (reservation) {
      return Response.json({ error: reservation.message }, { status: 500 })
    }

    const nomProfesseur = [professeur?.prenom, professeur?.nom].filter(Boolean).join(' ') || 'Un professeur'
    const admins = await adminsDeLEtablissement(serviceClient, etablissementId)
    await Promise.all(
      admins.map((adminId) =>
        creerNotification(serviceClient, {
          etablissementId,
          destinataireProfileId: adminId,
          type: 'timesheet_soumis',
          titre: `TimeSheet à valider · ${nomProfesseur}`,
          message: `${timesheet.numero} : ${totalHeures} h du ${corps.periodeDebut} au ${corps.periodeFin}.`,
          lien: '/admin/paiements',
        }),
      ),
    )

    return Response.json({ timesheetId: timesheet.id, numero: timesheet.numero })
  } catch (erreur) {
    if (erreur instanceof TeacherAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
