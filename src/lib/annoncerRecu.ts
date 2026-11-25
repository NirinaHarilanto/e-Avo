import { jetonAcces } from './jetonAcces'

/**
 * Prévient l'élève, tout de suite, que son paiement est bien arrivé — demande du client, le
 * 2026-11-25 : « quand le paiement est enregistré par l'admin, l'envoi du mail automatique doit
 * être instantané pour confirmer au payeur que l'admin a bien reçu le paiement ».
 *
 * À appeler après chaque enregistrement ou mise à jour d'un paiement par l'administration. Le
 * reçu lui-même est créé par un trigger ; cette fonction ne fait que déclencher son annonce.
 *
 * VOLONTAIREMENT SANS CONSÉQUENCE EN CAS D'ÉCHEC. Le paiement est déjà enregistré quand on
 * arrive ici : faire échouer l'écran parce qu'un e-mail n'est pas parti serait absurde, et
 * laisserait l'administration croire que sa saisie n'a pas été prise. Le cron de 9 h reprend de
 * toute façon tout reçu resté sans annonce.
 */
export async function annoncerRecuDuPaiement(paymentId: string): Promise<void> {
  try {
    const jeton = await jetonAcces()
    if (!jeton) return
    await fetch('/api/admin/annoncer-recu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ paymentId }),
    })
  } catch {
    // Hors ligne, route indisponible : le filet quotidien s'en chargera.
  }
}
