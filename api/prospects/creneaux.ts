/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creneauxLibres } from '../_lib/reservation.js'

export const config = { runtime: 'edge' }

/**
 * Créneaux d'appel diagnostic encore libres, pour la page vitrine publique (aucun jeton : le
 * visiteur est anonyme). Rien n'est stocké — la liste est recalculée à chaque appel à partir des
 * plages d'ouverture, des rendez-vous déjà pris, des cours planifiés et de l'agenda Google réel
 * de l'établissement.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    return Response.json({ error: 'Configuration Supabase serveur manquante.' }, { status: 500 })
  }

  const slug = new URL(request.url).searchParams.get('etablissement')
  if (!slug) {
    return Response.json({ error: 'Paramètre etablissement requis.' }, { status: 400 })
  }

  try {
    const serviceClient = createClient<Database>(url, serviceKey)
    const { data: etablissement } = await serviceClient
      .from('etablissements')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!etablissement) {
      return Response.json({ error: 'Établissement introuvable.' }, { status: 404 })
    }

    const resultat = await creneauxLibres(serviceClient, etablissement.id)
    return Response.json(resultat, {
      /* Courte mise en cache : la page vitrine peut être ouverte par plusieurs visiteurs à la
         suite, et chaque appel interroge l'agenda Google. 60 s reste imperceptible pour un
         créneau, tout en évitant de marteler l'API Google. */
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60' },
    })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
