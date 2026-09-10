/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

/**
 * Vérifie le jeton Bearer et retrouve la présence de l'appelant dans `platform_admins` (voir
 * migration 0022) — même forme que adminAuth.ts/teacherAuth.ts. Délibérément pas
 * d'`etablissementId` dans le contexte retourné : un platform admin n'est admin d'aucun
 * établissement en particulier, toute route consommant ce guard doit prendre l'établissement
 * cible depuis le corps de la requête, jamais du contexte de l'appelant.
 */
export interface PlatformAdminContext {
  serviceClient: ReturnType<typeof createClient<Database>>
  platformAdminId: string
}

export class PlatformAdminAuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requirePlatformAdmin(request: Request): Promise<PlatformAdminContext> {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    throw new PlatformAdminAuthError(401, 'Jeton manquant.')
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    throw new PlatformAdminAuthError(500, 'Configuration Supabase serveur manquante.')
  }

  const serviceClient = createClient<Database>(url, serviceKey)

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token)
  if (userError || !userData.user) {
    throw new PlatformAdminAuthError(401, 'Jeton invalide.')
  }

  const { data: platformAdmin, error: platformAdminError } = await serviceClient
    .from('platform_admins')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (platformAdminError || !platformAdmin) {
    throw new PlatformAdminAuthError(403, "Cette opération est réservée à un administrateur de la plateforme.")
  }

  return { serviceClient, platformAdminId: platformAdmin.id }
}
