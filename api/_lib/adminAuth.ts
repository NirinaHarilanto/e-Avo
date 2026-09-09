/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

/**
 * Vérifie le jeton Bearer envoyé par le client, retrouve le profil associé, et refuse
 * toute opération si le rôle/statut ne correspond pas — même si la clé service_role,
 * utilisée juste après pour l'opération elle-même, contourne déjà le RLS. Le contrôle de
 * rôle doit donc être explicite ici, jamais implicite via la RLS (le service_role l'ignore).
 */
export interface AdminContext {
  serviceClient: ReturnType<typeof createClient<Database>>
  profileId: string
  etablissementId: string
}

export class AdminAuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requireAdmin(request: Request): Promise<AdminContext> {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    throw new AdminAuthError(401, 'Jeton manquant.')
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    throw new AdminAuthError(500, 'Configuration Supabase serveur manquante.')
  }

  const serviceClient = createClient<Database>(url, serviceKey)

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token)
  if (userError || !userData.user) {
    throw new AdminAuthError(401, 'Jeton invalide.')
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, role, status, etablissement_id')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile) {
    throw new AdminAuthError(403, 'Profil introuvable.')
  }
  if (profile.role !== 'admin_etablissement' || profile.status !== 'approved') {
    throw new AdminAuthError(403, "Cette opération est réservée à l'administrateur de l'établissement.")
  }

  return { serviceClient, profileId: profile.id, etablissementId: profile.etablissement_id }
}
