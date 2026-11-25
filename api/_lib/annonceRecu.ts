/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { envoyerDepuisModele, montantLisible } from './templatesEmail.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Annonce d'un reçu à l'élève — modèle 2.3, « Nous avons bien reçu votre paiement ».
 *
 * Demande du client, le 2026-11-25 : « quand le paiement est enregistré par l'admin, l'envoi du
 * mail automatique doit être instantané pour confirmer au payeur que l'admin a bien reçu le
 * paiement ». Jusque-là, l'annonce attendait le passage du cron le lendemain matin à 9 h.
 *
 * Le reçu, lui, naît d'un trigger SQL (0174) dès que le paiement passe à « payé ». Un trigger ne
 * peut pas envoyer d'e-mail : c'est donc depuis le code appelant, juste après l'enregistrement,
 * qu'on prévient. Le cron reste en place comme FILET — il reprend ce qui n'a pas pu partir
 * (panne de Resend, fenêtre du navigateur fermée trop vite, paiement créé par un autre chemin).
 */

/** Reçus d'un paiement qui restent à annoncer, et l'annonce elle-même. */
export async function annoncerRecusDuPaiement(serviceClient: ServiceClient, paymentId: string): Promise<number> {
  const { data: recus } = await serviceClient
    .from('invoices')
    .select('id, etablissement_id, student_id, montant_ttc, numero, date_emission')
    .eq('payment_id', paymentId)
    .is('email_envoye_le', null)
    .like('numero', 'REC-%')
    .eq('statut', 'payee')
    .not('student_id', 'is', null)

  let envoyes = 0
  for (const recu of recus ?? []) {
    if (await annoncerRecu(serviceClient, recu)) envoyes += 1
  }
  return envoyes
}

export interface RecuAAnnoncer {
  id: string
  etablissement_id: string
  student_id: string | null
  montant_ttc: number
  numero: string
  date_emission?: string | null
}

/**
 * Envoie le modèle 2.3 pour un reçu, puis le marque annoncé.
 *
 * `email_envoye_le` est posé MÊME en cas d'échec d'envoi : sans cela, un établissement sans clé
 * Resend retenterait tous ses reçus à chaque passage, indéfiniment. L'administration dispose de
 * toute façon du reçu dans l'espace de l'élève et peut l'envoyer à la main depuis le modèle 2.3.
 */
export async function annoncerRecu(serviceClient: ServiceClient, recu: RecuAAnnoncer): Promise<boolean> {
  if (!recu.student_id) return false

  const { data: eleve } = await serviceClient
    .from('profiles')
    .select('prenom, email')
    .eq('id', recu.student_id)
    .maybeSingle()
  if (!eleve?.email) return false

  const resultat = await envoyerDepuisModele(serviceClient, {
    etablissementId: recu.etablissement_id,
    reference: '2.3',
    destinataires: [eleve.email],
    /* `invoices` ne porte pas de devise : tous les montants de l'application sont en ariary
       depuis la correction du 2026-09-29. */
    valeurs: { prenom: eleve.prenom, montant: montantLisible(recu.montant_ttc) },
  })

  await serviceClient.from('invoices').update({ email_envoye_le: new Date().toISOString() }).eq('id', recu.id)
  return resultat.envoye
}
