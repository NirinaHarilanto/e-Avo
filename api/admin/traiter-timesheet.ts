import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerNotification, formaterDateSeance } from '../_lib/notifications.js'
import { numeroSuivant } from '../_lib/numerotation.js'
import { calculerRemuneration, LIBELLE_TYPE_FACTURATION } from '../../src/lib/remuneration.js'
import type { LigneTimesheet } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

interface Corps {
  timesheetId?: string
  decision?: 'valide' | 'refuse'
  motif?: string
  /* Lignes à retirer du relevé avant de valider (ex. séance incluse à tort) — demande client du
     2026-10-12 : seul l'admin peut modifier un TimeSheet, et uniquement à la validation ; jamais
     une heure retouchée au milieu d'une ligne, une correction d'heure se fait sur la séance
     elle-même, pas en douce sur le relevé. */
  hourLedgerIdsExclus?: string[]
  /* Obligatoire dès que `hourLedgerIdsExclus` n'est pas vide. */
  justificatifModification?: string
}

/**
 * Validation ou refus d'un TimeSheet (0081). Valider recalcule le montant ligne par ligne au
 * taux EN VIGUEUR pour le type de chaque séance (individuel/collectif/duo, 0126) — jamais le
 * taux connu à l'envoi, qui n'était qu'une estimation — crée la rémunération, rattache les
 * heures à ce paiement et émet la facture de rémunération, visible aussitôt dans « Mes factures »
 * du professeur. Refuser libère les heures pour un prochain relevé, avec un motif obligatoire.
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

    const { data: professeur } = await serviceClient
      .from('profiles')
      .select(
        'taux_horaire_individuel, taux_horaire_duo, taux_horaire_collectif, taux_horaire_corporate, taux_horaire_chat_chill',
      )
      .eq('id', ts.teacher_id)
      .single()
    if (!professeur) {
      return Response.json({ error: 'Professeur introuvable.' }, { status: 404 })
    }

    const exclus = new Set(corps.hourLedgerIdsExclus ?? [])
    const justificatif = corps.justificatifModification?.trim() || null
    if (exclus.size > 0 && !justificatif) {
      return Response.json({ error: 'Indiquez pourquoi ces lignes sont retirées : le professeur le verra sur son relevé.' }, { status: 400 })
    }

    // Les heures doivent toujours être réservées à ce relevé et non payées entre-temps.
    const { data: ecritures } = await serviceClient
      .from('hour_ledger')
      .select('id, heures, type_facturation, teacher_payment_id')
      .eq('timesheet_id', ts.id)
    if (!ecritures?.length || ecritures.some((e) => e.teacher_payment_id)) {
      return Response.json({ error: 'Les heures de ce TimeSheet ont changé (déjà payées ?). Refusez-le et demandez un nouvel envoi.' }, { status: 409 })
    }
    if (exclus.size && [...exclus].some((id) => !ecritures.some((e) => e.id === id))) {
      return Response.json({ error: "Une ligne à retirer ne fait plus partie de ce TimeSheet." }, { status: 400 })
    }

    const ecrituresRetenues = ecritures.filter((e) => !exclus.has(e.id))
    if (ecrituresRetenues.length === 0) {
      return Response.json({ error: 'Toutes les lignes ont été retirées : rien à valider. Refusez plutôt ce TimeSheet.' }, { status: 400 })
    }

    if (exclus.size > 0) {
      const { error: liberationError } = await serviceClient.from('hour_ledger').update({ timesheet_id: null }).in('id', [...exclus])
      if (liberationError) return Response.json({ error: liberationError.message }, { status: 500 })
    }

    const { lignes: lignesCalculees, montant, heures, manque } = calculerRemuneration(ecrituresRetenues, professeur)
    if (manque.length > 0) {
      return Response.json(
        { error: `Taux horaire manquant pour : ${manque.map((t) => LIBELLE_TYPE_FACTURATION[t]).join(', ')}. Renseignez-le dans sa fiche (Professeurs) avant de valider.` },
        { status: 400 },
      )
    }
    const tauxParLigne = new Map(lignesCalculees.map((l) => [l.ligne.id, l]))

    /* Bonus en attente de ce professeur (0162, demande client du 2026-11-17 : « ces bonus
       apparaîtront sur le timesheet du professeur concerné »). Repris ICI, à la validation, et
       pas à l'envoi du relevé : c'est l'administration qui les accorde, et c'est la validation
       qui crée la rémunération. Un bonus accordé pendant que le relevé attendait entre donc dans
       celui-ci ; un bonus accordé après partira avec le suivant.

       `teacher_payment_id is null` est la seule définition de « en attente » (même convention
       que le grand livre, 0029) : un bonus déjà rattaché à une rémunération a déjà été payé. */
    const { data: bonusEnAttente } = await serviceClient
      .from('bonus_professeur')
      .select('id, montant, motif, accorde_le')
      .eq('teacher_id', ts.teacher_id)
      .is('teacher_payment_id', null)
      .order('accorde_le')
    const bonus = bonusEnAttente ?? []
    const montantBonus = bonus.reduce((total, b) => total + Number(b.montant), 0)
    /* Arrondi au centime comme le reste des montants de l'application : additionner des `numeric`
       relus en nombres flottants peut sinon produire un total à 0,000000001 près, qui se verrait
       sur la facture. */
    /* Prestations « Extra » (0163, demande client du 2026-11-17 : « pour les prestations
       validées, le montant validé sera rajouté automatiquement dans le timesheet du professeur
       également »). Deux conditions, et les deux comptent : `statut = 'validee'` — une
       prestation seulement planifiée est convenue mais pas encore reconnue comme due — et
       `teacher_payment_id is null`, qui dit qu'elle n'a pas déjà été payée (0029). */
    const { data: extrasValides } = await serviceClient
      .from('prestations_extra')
      .select('id, montant, type_prestation, date_prestation, lieu')
      .eq('teacher_id', ts.teacher_id)
      .eq('statut', 'validee')
      .is('teacher_payment_id', null)
      .order('date_prestation')
    const extras = extrasValides ?? []
    const montantExtras = extras.reduce((total, e) => total + Number(e.montant), 0)

    const montantTotal = Math.round((montant + montantBonus + montantExtras) * 100) / 100

    const { data: paiement, error: erreurPaiement } = await serviceClient
      .from('teacher_payments')
      .insert({
        etablissement_id: etablissementId,
        teacher_id: ts.teacher_id,
        montant: montantTotal,
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

    await serviceClient
      .from('hour_ledger')
      .update({ teacher_payment_id: paiement.id })
      .in('id', ecrituresRetenues.map((e) => e.id))

    /* Le même geste que pour les heures : rattacher à la rémunération, c'est marquer payé. Le
       relevé est noté au passage, pour que le document sache quels bonus il a portés — sans
       quoi un relevé validé afficherait les bonus accordés DEPUIS. */
    if (bonus.length > 0) {
      await serviceClient
        .from('bonus_professeur')
        .update({ teacher_payment_id: paiement.id, timesheet_id: ts.id })
        .in('id', bonus.map((b) => b.id))
    }

    // Même geste pour les prestations Extra : rattacher à la rémunération, c'est marquer payé.
    if (extras.length > 0) {
      await serviceClient
        .from('prestations_extra')
        .update({ teacher_payment_id: paiement.id, timesheet_id: ts.id })
        .in('id', extras.map((e) => e.id))
    }

    // Lignes finalisées : taux/montant figés au taux EN VIGUEUR à la validation (plus l'estimation
    // de l'envoi), lignes exclues retirées de `lignes` et tracées à part dans `lignes_retirees`.
    const lignesOrigine = ts.lignes as LigneTimesheet[]
    const lignesRetenuesFinalisees = lignesOrigine
      .filter((l) => !exclus.has(l.hour_ledger_id))
      .map((l) => {
        const calc = tauxParLigne.get(l.hour_ledger_id)
        return calc ? { ...l, type: calc.type, taux: calc.taux, montant: calc.montant } : l
      })
    const lignesRetireesFinalisees = lignesOrigine.filter((l) => exclus.has(l.hour_ledger_id))

    const objet = `Rémunération — TimeSheet ${ts.numero} (du ${ts.periode_debut} au ${ts.periode_fin})`
    const lignesFacture = lignesRetenuesFinalisees.map((l) => ({
      description: `${l.debut ? formaterDateSeance(l.debut) : 'Séance'}${l.eleves ? ` — ${l.eleves}` : ''}${l.type ? ` (${LIBELLE_TYPE_FACTURATION[l.type]})` : ''}`,
      quantite: l.heures,
      prix_unitaire_ht: l.taux ?? 0,
      tva_pct: 0,
    }))
    /* Une ligne par bonus, après les séances : la facture doit dire d'où vient chaque ariary.
       Quantité 1 et prix unitaire = le montant, puisqu'un bonus n'a pas d'heures. */
    for (const b of bonus) {
      lignesFacture.push({
        description: `Bonus — ${b.motif}`,
        quantite: 1,
        prix_unitaire_ht: Number(b.montant),
        tva_pct: 0,
      })
    }

    /* Une ligne par prestation, après les bonus. Quantité 1 et prix unitaire = le montant :
       un Extra porte son propre montant, il ne se calcule pas à partir d'une durée (0163). */
    for (const e of extras) {
      const quand = new Date(e.date_prestation).toLocaleDateString('fr-FR')
      const ou = e.lieu && e.lieu.trim() ? ` · ${e.lieu.trim()}` : ''
      lignesFacture.push({
        description: `Prestation — ${e.type_prestation} (${quand})${ou}`,
        quantite: 1,
        prix_unitaire_ht: Number(e.montant),
        tva_pct: 0,
      })
    }

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
        montant_ht: montantTotal,
        montant_tva: 0,
        montant_ttc: montantTotal,
        notes: ts.commentaire ? `Commentaire du professeur : ${ts.commentaire}` : null,
        created_by_profile_id: profileId,
      })
      .select('id, numero')
      .single()
    if (erreurFacture || !facture) {
      return Response.json({ error: erreurFacture?.message ?? 'La facture n’a pas pu être créée.' }, { status: 500 })
    }

    /* Le professeur doit comprendre un total supérieur à ses heures sans avoir à ouvrir la
       facture : sans cette mention, un bonus ressemblerait à une erreur de calcul. */
    const mentionBonus = [
      bonus.length > 0 ? `${montantBonus.toLocaleString('fr-FR')} Ar de bonus (${bonus.length})` : null,
      extras.length > 0 ? `${montantExtras.toLocaleString('fr-FR')} Ar de prestations (${extras.length})` : null,
    ].filter((p): p is string => p !== null)
    const mentionSupplements = mentionBonus.length > 0 ? `, dont ${mentionBonus.join(' et ')}` : ''

    await serviceClient
      .from('timesheets')
      .update({
        statut: 'valide',
        // Plus de sens dès qu'un relevé mélange des types de séance : chaque ligne porte
        // désormais son propre taux (voir lignesRetenuesFinalisees).
        taux_horaire: null,
        total_heures: heures,
        montant,
        lignes: lignesRetenuesFinalisees,
        lignes_retirees: lignesRetireesFinalisees,
        justificatif_modification: justificatif,
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
      message:
        exclus.size > 0
          ? `Facture ${facture.numero} émise : ${montantTotal.toLocaleString('fr-FR')} Ar pour ${heures} h${mentionSupplements}. ${exclus.size} ligne(s) retirée(s) par l'administration : ${justificatif}.`
          : `Facture ${facture.numero} émise : ${montantTotal.toLocaleString('fr-FR')} Ar pour ${heures} h${mentionSupplements}.`,
      lien: '/professeur/factures',
    })

    return Response.json({
      ok: true,
      factureId: facture.id,
      numero: facture.numero,
      paiementId: paiement.id,
      bonusRepris: bonus.length,
      montantBonus,
      extrasRepris: extras.length,
      montantExtras,
    })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
