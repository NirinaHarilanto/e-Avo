/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Limitation de débit des routes PUBLIQUES (sans compte) — demande client du 2026-10-07, suite à
 * la revue de sécurité du même jour : aucune de ces routes n'avait de garde-fou (12 appels
 * d'affilée au même endpoint, tous acceptés, vérifié en conditions réelles).
 *
 * Comptage en base (migration 0101, fonction `verifier_limite_debit`) plutôt qu'un service tiers :
 * cohérent avec le reste du projet, qui n'utilise que Supabase, sans compte supplémentaire à
 * faire souscrire au client. L'IP n'est jamais conservée en clair, seule son empreinte SHA-256
 * l'est — suffisant pour distinguer deux visiteurs sans garder une donnée directement
 * identifiante.
 *
 * Tourne en edge runtime : WebCrypto (`crypto.subtle`), jamais `node:crypto`.
 */

async function hacherIp(ip: string): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(empreinte))
    .map((octet) => octet.toString(16).padStart(2, '0'))
    .join('')
}

/* Vercel pose `x-forwarded-for` sur toute requête edge ; la première adresse de la liste est
   celle du visiteur, les suivantes sont les relais intermédiaires. Son absence (environnement de
   test, proxy inhabituel) ne doit jamais faire échouer la route : elle retombe alors sur une clé
   commune à tous les visiteurs sans IP connue — un plafond partagé pour ce cas rare, jamais une
   porte dérobée qui contournerait la limite. */
function ipAppelant(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'ip-inconnue'
}

export interface LimiteDebit {
  /** Identifie la route dans la clé de comptage — deux routes ne partagent jamais leur quota. */
  route: string
  max: number
  fenetreSecondes: number
}

/**
 * `null` si la requête peut continuer, ou la réponse 429 à renvoyer telle quelle sinon.
 *
 * Volontairement permissif en cas de panne du compteur lui-même (table ou fonction indisponible,
 * incident réseau vers Supabase) : une limitation de débit sert à absorber un abus, elle ne doit
 * jamais devenir elle-même la raison pour laquelle un visiteur légitime ne peut plus réserver un
 * cours ou déposer sa candidature.
 */
export async function verifierDebit(
  request: Request,
  serviceClient: ServiceClient,
  limite: LimiteDebit,
): Promise<Response | null> {
  const cle = `${limite.route}:${await hacherIp(ipAppelant(request))}`
  const { data: autorise, error } = await serviceClient.rpc('verifier_limite_debit', {
    p_cle: cle,
    p_max: limite.max,
    p_fenetre_secondes: limite.fenetreSecondes,
  })

  if (error) return null
  if (autorise) return null

  return Response.json(
    { error: 'Trop de tentatives. Réessayez dans un instant.' },
    { status: 429, headers: { 'Retry-After': String(limite.fenetreSecondes) } },
  )
}
