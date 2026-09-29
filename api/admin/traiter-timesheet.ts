import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerNotification, formaterDateSeance } from '../_lib/notifications.js'
import { numeroSuivant } from '../_lib/numerotation.js'
import type { LigneTimesheet } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

interface Corps {
  timesheetId?: string
  decision?: 'valide' | 'refuse'
  motif?: string
}

/**
 * Validation ou refus d'un TimeSheet (0081). Valider crée, en un geste, la rémunération du
 * professeur (heures × taux horaire en vigueur), rattache les heures à ce paiement et émet la
 * facture de rémunération — visible aussitôt dans « Mes factures » du professeur. Refuser
 * libère les heures pour un prochain relevé, avec un motif obligatoire.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.timesheetId || (corps.decision !== 'valide' && corps.decision !== 'refuse')) {
      return Response.json({ error: 'TimeSheet et décision sont obligatoires.' }, { status: 400 })
    }

    const { data: ts } = await serviceClient
      .from('timesheets')
      .select('*')
      .eq('id', corps.timesheetId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()
    if (!ts) {
      return Response.json({ error: 'TimeSheet introuvable.' }, { status: 404 })
    }
    if (ts.statut !== 'soumis') {
      return Response.json({ error: 'Ce TimeSheet a déjà été traité.' }, { status: 409 })
    }

    if (corps.decision === 'refuse') {
      const motif = corps.motif?.trim()
      if (!motif) {
        return Response.json({ error: 'Indiquez le motif du refus, il sera transmis au professeur.' }, { status: 400 })
      }
      await serviceClient.from('hour_ledger').update({ timesheet_id: null }).eq('timesheet_id', ts.id)
      const { error } = await serviceClient
        .from('timesheets')
        .update({ statut: 'refuse', motif_refus: motif, traite_le: new Date().toISOString(), traite_par: profileId })
        .eq('id', ts.id)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      await creerNotification(serviceClient, {
        etablissementId,
        destinataireProfileId: ts.teacher_id,
        type: 'timesheet_refuse',
        titre: `TimeSheet ${ts.numero} refusé`,
        message: `Motif : ${motif}. Les heures sont de nouveau disponibles pour un prochain TimeSheet.`,
        lien: '/professeur/heures',
      })
      return Response.json({ ok: true })
    }

    const { data: professeur } = await serviceClient.from('profiles').select('taux_horaire').eq('id', ts.teacher_id).single()
    const taux = professeur?.taux_horaire ?? null
    if (!taux) {
      return Response.json(
        { error: "Ce professeur n'a pas de taux horaire : renseignez-le dans sa fiche (Professeurs) avant de valider." },
        { status: 400 },
      )
    }

    // Les heures doivent toujours être réservées à ce relevé et non payées entre-temps.
    const { data: ecritures } = await serviceClient
      .from('hour_ledger')
      .select('id, teacher_payment_id')
      .eq('timesheet_id', ts.id)
    if (!ecritures?.length || ecritures.some((e) => e.teacher_payment_id)) {
      return Response.json({ error: 'Les heures de ce TimeSheet ont changé (déjà payées ?). Refusez-le et demandez un nouvel envoi.' }, { status: 409 })
    }

    const montant = Math.round(Number(ts.total_heures) * taux * 100) / 100
    const { data: paiement, error: erreurPaiement } = await serviceClient
      .from('teacher_payments')
      .insert({
        etablissement_id: etablissementId,
        teacher_id: ts.teacher_id,
        montant,
        periode_debut: ts.periode_debut,
        periode_fin: ts.periode_fin,
        mode_remuneration: 'horaire',
        statut: 'attendu',
        notes: `TimeSheet ${ts.numero}`,
        created_by_profile_id: profileId,
      })
      .select('id')
      .single()
    if (erreurPaiement || !paiement) {
      return Response.json({ error: erreurPaiement?.message ?? 'La rémunération n’a pas pu être créée.' }, { status: 500 })
    }

    await serviceClient.from('hour_ledger').update({ teacher_payment_id: paiement.id }).eq('timesheet_id', ts.id)

    const objet = `Rémunération — TimeSheet ${ts.numero} (du ${ts.periode_debut} au ${ts.periode_fin})`
    const lignesFacture = (ts.lignes as LigneTimesheet[]).map((l) => ({
      description: `${l.debut ? formaterDateSeance(l.debut) : 'Séance'}${l.eleves ? ` — ${l.eleves}` : ''}`,
      quantite: l.heures,
      prix_unitaire_ht: taux,
      tva_pct: 0,
    }))
    const numero = await numeroSuivant(serviceClient, 'invoices', 'FAC', etablissementId)
    const { data: facture, error: erreurFacture } = await serviceClient
      .from('invoices')
      .insert({
        etablissement_id: etablissementId,
        teacher_id: ts.teacher_id,
        teacher_payment_id: paiement.id,
        numero,
        statut: 'emise',
        objet,
        lignes: lignesFacture,
        montant_ht: montant,
        montant_tva: 0,
        montant_ttc: montant,
        notes: ts.commentaire ? `Commentaire du professeur : ${ts.commentaire}` : null,
        created_by_profile_id: profileId,
      })
      .select('id, numero')
      .single()
    if (erreurFacture || !facture) {
      return Response.json({ error: erreurFacture?.message ?? 'La facture n’a pas pu être créée.' }, { status: 500 })
    }

    await serviceClient
      .from('timesheets')
      .update({
        statut: 'valide',
        taux_horaire: taux,
        montant,
        traite_le: new Date().toISOString(),
        traite_par: profileId,
        teacher_payment_id: paiement.id,
        invoice_id: facture.id,
      })
      .eq('id', ts.id)

    await creerNotification(serviceClient, {
      etablissementId,
      destinataireProfileId: ts.teacher_id,
      type: 'timesheet_valide',
      titre: `TimeSheet ${ts.numero} validé`,
      message: `Facture ${facture.numero} émise : ${montant.toLocaleString('fr-FR')} Ar pour ${ts.total_heures} h.`,
      lien: '/professeur/factures',
    })

    return Response.json({ ok: true, factureId: facture.id, numero: facture.numero, paiementId: paiement.id })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
