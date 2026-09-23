/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creerNotification } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

/**
 * Relances automatiques des échéances de paiement — demande client du 2026-09-23 (point 12) :
 * « rajoute également la possibilité de planifier une échéance de paiement avec les relances
 * automatiques liées au paiement à l'approche des échéances ».
 *
 * Déclenché une fois par jour par le cron Vercel (voir vercel.json). Une échéance n'est relancée
 * qu'une seule fois — `relance_envoyee_le` sert de garde-fou : sans lui, un élève recevrait la
 * même notification chaque jour jusqu'à son paiement.
 *
 * Le délai de prévenance est propre à chaque établissement (`relance_echeance_jours`), un
 * échéancier ne se relançant pas de la même façon selon les habitudes de la maison.
 */
export default async function handler(request: Request): Promise<Response> {
  /* Vercel signe ses appels de cron avec `CRON_SECRET`. Sans cette vérification, n'importe qui
     pourrait déclencher une vague de notifications en appelant l'URL publiquement. */
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    return Response.json({ error: 'Configuration Supabase manquante.' }, { status: 500 })
  }
  const serviceClient = createClient<Database>(url, serviceKey)

  const { data: etablissements } = await serviceClient.from('etablissements').select('id, relance_echeance_jours')
  const delaiParEtablissement = new Map((etablissements ?? []).map((e) => [e.id, e.relance_echeance_jours]))

  /* Une seule requête pour toutes les échéances encore dues et jamais relancées : le tri par
     établissement se fait ensuite en mémoire, il y en a trop peu pour justifier une requête par
     établissement. La borne haute est le délai le plus généreux configuré. */
  const delaiMax = Math.max(0, ...[...delaiParEtablissement.values()])
  const limite = new Date()
  limite.setDate(limite.getDate() + delaiMax)

  const { data: echeances, error } = await serviceClient
    .from('paiement_echeances')
    .select('*')
    .is('reglee_le', null)
    .is('relance_envoyee_le', null)
    .lte('date_echeance', limite.toISOString().slice(0, 10))
  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const paiementIds = [...new Set((echeances ?? []).map((e) => e.student_payment_id))]
  const { data: paiements } = paiementIds.length
    ? await serviceClient.from('student_payments').select('id, student_id, devise').in('id', paiementIds)
    : { data: [] }
  const paiementParId = new Map((paiements ?? []).map((p) => [p.id, p]))

  const aujourdhui = new Date()
  let envoyees = 0

  for (const echeance of echeances ?? []) {
    const delai = delaiParEtablissement.get(echeance.etablissement_id)
    if (delai === undefined) continue

    const seuil = new Date(aujourdhui)
    seuil.setDate(seuil.getDate() + delai)
    if (echeance.date_echeance > seuil.toISOString().slice(0, 10)) continue

    const paiement = paiementParId.get(echeance.student_payment_id)
    if (!paiement?.student_id) continue

    const echue = echeance.date_echeance < aujourdhui.toISOString().slice(0, 10)
    const quand = new Date(echeance.date_echeance).toLocaleDateString('fr-FR')
    await creerNotification(serviceClient, {
      etablissementId: echeance.etablissement_id,
      destinataireProfileId: paiement.student_id,
      type: 'echeance_paiement',
      titre: echue ? 'Échéance de paiement dépassée' : 'Échéance de paiement à venir',
      message: `${echeance.libelle ? `${echeance.libelle} — ` : ''}${echeance.montant} ${paiement.devise} ${
        echue ? `étaient attendus le ${quand}.` : `sont attendus le ${quand}.`
      }`,
      lien: '/etudiant/paiements',
    })

    await serviceClient
      .from('paiement_echeances')
      .update({ relance_envoyee_le: new Date().toISOString() })
      .eq('id', echeance.id)
    envoyees += 1
  }

  return Response.json({ relances: envoyees })
}
