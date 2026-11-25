/// <reference types="node" />
import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { annoncerRecusDuPaiement } from '../_lib/annonceRecu.js'

export const config = { runtime: 'edge' }

/**
 * Annonce immédiate du reçu d'un paiement — demande du client, le 2026-11-25 : « quand le
 * paiement est enregistré par l'admin, l'envoi du mail automatique doit être instantané pour
 * confirmer au payeur que l'admin a bien reçu le paiement ».
 *
 * Pourquoi une route plutôt qu'un trigger : un trigger PostgreSQL ne peut pas envoyer d'e-mail.
 * Et pourquoi une route appelée par l'ÉCRAN plutôt qu'un ajout dans les routes d'enregistrement :
 * la plupart des paiements sont enregistrés directement depuis le navigateur de l'administration
 * (écran Paiements, fiche d'un paiement, frais collectifs), sans passer par une route serveur.
 * Ce point d'entrée unique sert donc tous ces chemins.
 *
 * Réservé aux admins, comme l'enregistrement du paiement lui-même.
 *
 * L'appelant n'a pas à attendre la réponse ni à la traiter : si l'annonce échoue ici, le cron de
 * 9 h la reprendra demain. C'est volontairement une opération que l'on peut perdre.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Méthode non autorisée.' }, { status: 405 })
  }

  try {
    const { serviceClient } = await requireAdmin(request)

    const corps = (await request.json().catch(() => ({}))) as { paymentId?: string }
    if (!corps.paymentId) {
      return Response.json({ error: 'paymentId est requis.' }, { status: 400 })
    }

    const envoyes = await annoncerRecusDuPaiement(serviceClient, corps.paymentId)
    return Response.json({ ok: true, envoyes })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Annonce impossible.' }, { status: 500 })
  }
}
