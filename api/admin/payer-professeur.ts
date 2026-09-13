import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  teacherId?: string
  hourLedgerIds?: string[]
}

// Règlement au forfait horaire : calcule le montant à partir des écritures hour_ledger non
// payées sélectionnées (heures × taux_horaire du professeur), crée la rémunération, puis
// tague ces écritures comme payées. `hour_ledger` n'a aucune policy update cliente (0011) —
// cette étape doit donc passer par le service_role, comme la clôture de séance.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.teacherId || !body.hourLedgerIds?.length) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: teacher } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id, taux_horaire')
      .eq('id', body.teacherId)
      .single()
    if (!teacher || teacher.role !== 'professeur' || teacher.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Professeur invalide pour cet établissement.' }, { status: 400 })
    }
    if (!teacher.taux_horaire) {
      return Response.json({ error: "Ce professeur n'a pas de taux horaire renseigné." }, { status: 400 })
    }

    const { data: lignes } = await serviceClient
      .from('hour_ledger')
      .select('id, heures, teacher_id, etablissement_id, type_ecriture, teacher_payment_id')
      .in('id', body.hourLedgerIds)

    const lignesValides = (lignes ?? []).filter(
      (l) =>
        l.teacher_id === body.teacherId &&
        l.etablissement_id === etablissementId &&
        l.type_ecriture === 'credit_professeur' &&
        l.teacher_payment_id === null,
    )
    if (lignesValides.length !== body.hourLedgerIds.length) {
      return Response.json({ error: 'Une ou plusieurs écritures sont invalides ou déjà payées.' }, { status: 400 })
    }

    const heures = lignesValides.reduce((total, l) => total + l.heures, 0)
    const montant = Math.round(heures * teacher.taux_horaire * 100) / 100

    const { data: paiement, error: paiementError } = await serviceClient
      .from('teacher_payments')
      .insert({
        etablissement_id: etablissementId,
        teacher_id: body.teacherId,
        montant,
        mode_remuneration: 'horaire',
        statut: 'attendu',
        created_by_profile_id: profileId,
      })
      .select('id')
      .single()
    if (paiementError || !paiement) {
      return Response.json({ error: paiementError?.message ?? 'Échec de la création du paiement.' }, { status: 500 })
    }

    const { error: majError } = await serviceClient
      .from('hour_ledger')
      .update({ teacher_payment_id: paiement.id })
      .in('id', body.hourLedgerIds)
    if (majError) {
      return Response.json({ error: majError.message }, { status: 500 })
    }

    return Response.json({ paymentId: paiement.id, heures, montant })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
