/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

// Route publique (pas de jeton — le visiteur qui confirme est anonyme) : quand un prospect
// répond "oui" à la question "avez-vous pu réserver un créneau ?" affichée après l'ouverture
// de Calendly, ce endpoint fait passer son statut à diagnostic_planifie. Volontairement borné
// à ce seul champ (le corps de la requête ne peut rien piloter d'autre) pour limiter la
// surface exposée sans authentification.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    return Response.json({ error: 'Configuration Supabase serveur manquante.' }, { status: 500 })
  }

  try {
    const body = (await request.json()) as { prospectId?: string }
    if (!body.prospectId) {
      return Response.json({ error: 'prospectId requis.' }, { status: 400 })
    }

    const serviceClient = createClient<Database>(url, serviceKey)
    const { error } = await serviceClient
      .from('prospects')
      .update({ statut: 'diagnostic_planifie' })
      .eq('id', body.prospectId)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
