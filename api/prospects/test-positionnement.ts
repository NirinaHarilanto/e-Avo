/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

/**
 * Créneaux de test oral encore ouverts et énoncés du quiz de positionnement, pour la page
 * vitrine publique (visiteur anonyme, aucun jeton).
 *
 * Les corrigés ne sortent jamais d'ici : `quiz_questions.bonne_reponse` est lu côté serveur
 * pour compter les places et rien d'autre, et la réponse ne contient que l'énoncé et les
 * propositions. La correction se fait à l'inscription (api/prospects/inscrire-test).
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
    const { data: etablissement } = await serviceClient.from('etablissements').select('id').eq('slug', slug).maybeSingle()
    if (!etablissement) {
      return Response.json({ error: 'Établissement introuvable.' }, { status: 404 })
    }

    const resultat = await creneauxTestOuverts(serviceClient, etablissement.id)

    const { data: questions } = await serviceClient
      .from('quiz_questions')
      .select('id, ordre, enonce, options')
      .eq('etablissement_id', etablissement.id)
      .eq('actif', true)
      .order('ordre')

    return Response.json(
      { creneaux: resultat, questions: questions ?? [] },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30' } },
    )
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export interface CreneauTestPublic {
  id: string
  debut: string
  dureeMinutes: number
  vague: string
  langue: string | null
  placesRestantes: number | null
}

/**
 * Créneaux à venir, actifs, dont la vague n'est pas terminée et qui ont encore de la place.
 *
 * Partagé avec l'inscription (api/prospects/inscrire-test) pour la même raison que
 * `creneauxLibres` l'est entre l'affichage et la réservation d'un appel : deux vérifications
 * écrites séparément finissent par diverger, et un candidat se verrait refuser un créneau que
 * la page vient de lui proposer.
 */
export async function creneauxTestOuverts(
  serviceClient: ReturnType<typeof createClient<Database>>,
  etablissementId: string,
): Promise<CreneauTestPublic[]> {
  const { data: creneaux } = await serviceClient
    .from('creneaux_test_positionnement')
    .select('id, debut, duree_minutes, capacite_max, cohort_id')
    .eq('etablissement_id', etablissementId)
    .eq('actif', true)
    .gt('debut', new Date().toISOString())
    .order('debut')

  if (!creneaux || creneaux.length === 0) return []

  const [{ data: vagues }, { data: inscriptions }] = await Promise.all([
    serviceClient
      .from('cohorts')
      .select('id, nom, langue, statut')
      .in('id', [...new Set(creneaux.map((c) => c.cohort_id))]),
    serviceClient
      .from('test_positionnement_inscriptions')
      .select('creneau_id')
      .in('creneau_id', creneaux.map((c) => c.id)),
  ])

  const vagueParId = new Map((vagues ?? []).map((v) => [v.id, v]))
  const inscritsParCreneau = new Map<string, number>()
  for (const inscription of inscriptions ?? []) {
    inscritsParCreneau.set(inscription.creneau_id, (inscritsParCreneau.get(inscription.creneau_id) ?? 0) + 1)
  }

  return creneaux
    .map((creneau) => {
      const vague = vagueParId.get(creneau.cohort_id)
      if (!vague || vague.statut === 'terminee') return null
      const places = creneau.capacite_max == null ? null : creneau.capacite_max - (inscritsParCreneau.get(creneau.id) ?? 0)
      if (places !== null && places <= 0) return null
      return {
        id: creneau.id,
        debut: creneau.debut,
        dureeMinutes: creneau.duree_minutes,
        vague: vague.nom,
        langue: vague.langue,
        placesRestantes: places,
      }
    })
    .filter((c): c is CreneauTestPublic => c !== null)
}
