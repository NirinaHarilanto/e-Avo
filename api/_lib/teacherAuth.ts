/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

/**
 * Vérifie le jeton Bearer et retrouve le profil associé, comme `adminAuth.ts`. Utilisé pour
 * les opérations de planning qui touchent `session_enrollments` et `hour_ledger` : ces deux
 * tables n'ont aucune policy d'écriture pour `professeur` (seul un admin peut écrire dans
 * session_enrollments, et seule la clé service_role peut écrire dans hour_ledger — voir les
 * commentaires des migrations 0009 et 0011). Un professeur planifiant ou clôturant sa propre
 * séance doit donc passer par ici, avec le contrôle de rôle explicite ci-dessous.
 */
export interface TeacherContext {
  serviceClient: ReturnType<typeof createClient<Database>>
  profileId: string
  etablissementId: string
  // Un compte garde un rôle unique, sauf l'administrateur plateforme qui cumule les deux —
  // voir migration 0023. `roles` reflète donc les capacités réelles de l'appelant, jamais
  // uniquement `profiles.role`.
  roles: Array<'professeur' | 'admin_etablissement'>
}

export class TeacherAuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requireTeacherOrAdmin(request: Request): Promise<TeacherContext> {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    throw new TeacherAuthError(401, 'Jeton manquant.')
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    throw new TeacherAuthError(500, 'Configuration Supabase serveur manquante.')
  }

  const serviceClient = createClient<Database>(url, serviceKey)

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token)
  if (userError || !userData.user) {
    throw new TeacherAuthError(401, 'Jeton invalide.')
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, role, status, etablissement_id')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile) {
    throw new TeacherAuthError(403, 'Profil introuvable.')
  }
  if (profile.status !== 'approved') {
    throw new TeacherAuthError(403, 'Cette opération est réservée à un professeur ou à un administrateur.')
  }

  const roles = new Set<'professeur' | 'admin_etablissement'>()
  if (profile.role === 'professeur' || profile.role === 'admin_etablissement') {
    roles.add(profile.role)
  }
  const { data: platformAdmin } = await serviceClient
    .from('platform_admins')
    .select('id')
    .eq('id', profile.id)
    .maybeSingle()
  if (platformAdmin) {
    roles.add('professeur')
    roles.add('admin_etablissement')
  }
  if (roles.size === 0) {
    throw new TeacherAuthError(403, 'Cette opération est réservée à un professeur ou à un administrateur.')
  }

  return {
    serviceClient,
    profileId: profile.id,
    etablissementId: profile.etablissement_id,
    roles: [...roles],
  }
}
