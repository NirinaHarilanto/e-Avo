import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { adminsDeLEtablissement } from '../_lib/reservation.js'
import { creerNotification } from '../_lib/notifications.js'
import { numeroSuivant } from '../_lib/numerotation.js'
import { calculerRemuneration } from '../../src/lib/remuneration.js'
import { LIBELLE_TYPE_PRESTATION } from '../../src/lib/prestationsExternes.js'
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
      .select(
        'id, heures, session_id, prestation_externe_id, teacher_id, etablissement_id, type_ecriture, type_facturation, teacher_payment_id, timesheet_id',
      )
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

    /* Une écriture vient d'une séance HOC OU d'une prestation externe (0131) : les deux se
       déclarent sur le même relevé, c'est tout l'intérêt. Les identifiants sont donc filtrés
       avant d'interroger chaque table. */
    const sessionIds = [...new Set(valides.map((e) => e.session_id).filter((id): id is string => id !== null))]
    const prestationIds = [...new Set(valides.map((e) => e.prestation_externe_id).filter((id): id is string => id !== null))]
    const [{ data: seances }, { data: inscriptions }, { data: prestations }, { data: professeur }] = await Promise.all([
      sessionIds.length
        ? serviceClient.from('sessions').select('id, debut').in('id', sessionIds)
        : Promise.resolve({ data: [] as { id: string; debut: string }[] }),
      sessionIds.length
        ? serviceClient.from('session_enrollments').select('session_id, student_id').in('session_id', sessionIds)
        : Promise.resolve({ data: [] as { session_id: string; student_id: string }[] }),
      prestationIds.length
        ? serviceClient.from('prestations_externes').select('id, debut, type, client').in('id', prestationIds)
        : Promise.resolve({ data: [] as { id: string; debut: string; type: 'corporate' | 'chat_chill'; client: string }[] }),
      serviceClient
        .from('profiles')
        .select(
          'prenom, nom, taux_horaire_individuel, taux_horaire_duo, taux_horaire_collectif, taux_horaire_corporate, taux_horaire_chat_chill',
        )
        .eq('id', profileId)
        .single(),
    ])
    const eleveIds = [...new Set((inscriptions ?? []).map((i) => i.student_id))]
    const { data: eleves } = eleveIds.length
      ? await serviceClient.from('profiles').select('id, prenom, nom').in('id', eleveIds)
      : { data: [] as { id: string; prenom: string | null; nom: string | null }[] }
    const nomEleve = new Map((eleves ?? []).map((e) => [e.id, [e.prenom, e.nom].filter(Boolean).join(' ')]))
    const debutSeance = new Map((seances ?? []).map((s) => [s.id, s.debut]))
    const prestationParId = new Map((prestations ?? []).map((p) => [p.id, p]))

    /* Taux appliqué par ligne SELON LE TYPE de chacune (0126) — simple estimation à ce stade,
       tant que le relevé n'est pas validé : le montant définitif est recalculé avec le taux en
       vigueur au moment de la validation (voir api/admin/traiter-timesheet.ts), une ligne peut
       donc afficher un montant différent une fois le TimeSheet traité si le taux a changé
       entre-temps. `manque` n'est volontairement pas bloquant ici : un professeur peut envoyer
       son relevé même si l'admin n'a pas encore renseigné un des 3 taux, la validation le lui
       demandera alors explicitement. */
    const { lignes: lignesCalculees, montant: montantEstime } = calculerRemuneration(valides, professeur ?? {
      taux_horaire_individuel: null,
      taux_horaire_duo: null,
      taux_horaire_collectif: null,
      taux_horaire_corporate: null,
      taux_horaire_chat_chill: null,
    })
    const lignes: LigneTimesheet[] = lignesCalculees
      .map(({ ligne: e, type, taux: tauxLigne, montant: montantLigne }) => {
        const prestation = e.prestation_externe_id ? prestationParId.get(e.prestation_externe_id) : null
        return {
        hour_ledger_id: e.id,
        session_id: e.session_id,
        prestation_externe_id: e.prestation_externe_id,
        debut: prestation ? prestation.debut : e.session_id ? (debutSeance.get(e.session_id) ?? null) : null,
        /* `eleves` porte l'intitulé de la ligne : les élèves pour une séance, le client pour une
           prestation externe, qui n'en a aucun. Le relevé et la facture l'affichent tel quel. */
        eleves: prestation
          ? `${LIBELLE_TYPE_PRESTATION[prestation.type]} · ${prestation.client}`
          : (inscriptions ?? [])
          .filter((i) => i.session_id === e.session_id)
          .map((i) => nomEleve.get(i.student_id) ?? 'Élève')
          .join(', '),
        heures: Number(e.heures),
        type,
        taux: tauxLigne,
        montant: montantLigne,
        }
      })
      .sort((a, b) => (a.debut ?? '').localeCompare(b.debut ?? ''))

    const totalHeures = Math.round(lignes.reduce((t, l) => t + l.heures, 0) * 100) / 100
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
        // `taux_horaire` (le champ unique d'avant 0126) n'a plus de sens dès qu'un relevé mélange
        // des types de séance différents : chaque ligne porte désormais son propre taux.
        taux_horaire: null,
        montant: montantEstime,
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
