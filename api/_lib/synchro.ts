/// <reference types="node" />

/**
 * Émet le signal « quelque chose a changé » sur le canal Broadcast `synchro:<etablissement_id>`
 * (voir src/lib/synchro.ts pour le principe) — demande client du 2026-09-29 : agendas admin,
 * professeur et étudiant à jour instantanément. Appelé par creerNotification(), donc à chaque
 * événement métier côté serveur, y compris ceux d'un visiteur anonyme (réservation d'appel,
 * inscription à un test) qui n'a lui-même aucun canal ouvert.
 *
 * Aucune donnée métier dans le message : chaque navigateur relit ses données par les requêtes
 * habituelles, filtrées par RLS. Jamais bloquant : un échec (ou 2 s sans réponse) est ignoré,
 * l'action métier a déjà réussi et les pages se resynchronisent de toute façon au prochain
 * chargement.
 */
export async function signalerSynchro(etablissementId: string) {
  const url = process.env.SUPABASE_URL
  const cle = process.env.SUPABASE_SECRET_KEY
  if (!url || !cle || !etablissementId) return
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: `synchro:${etablissementId}`, event: 'changement', payload: {} }] }),
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // Voir ci-dessus : jamais bloquant.
  }
}
