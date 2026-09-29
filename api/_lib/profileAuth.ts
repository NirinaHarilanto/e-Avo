/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

/**
 * Variante allégée de adminAuth.ts/teacherAuth.ts : vérifie le jeton et exige seulement un
 * profil approuvé, quel que soit le rôle — pour les opérations où l'autorisation fine dépend
 * de la ressource visée plutôt que du rôle global (ex. supprimer un document : autorisé si
 * admin OU si on est celui qui l'a uploadé, peu importe le rôle).
 */
export interface ProfileAuthContext {
  serviceClient: ReturnType<typeof createClient<Database>>
  profileId: string
  etablissementId: string
  role: Database['public']['Tables']['profiles']['Row']['role']
  // Un compte garde un rôle unique, sauf l'administrateur plateforme qui a les mêmes droits
  // qu'un admin_etablissement (voir migration 0023) — à utiliser à la place de
  // `role === 'admin_etablissement'` pour toute vérification d'autorisation admin.
  estAdminEtablissement: boolean
}

export class ProfileAuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requireApprovedProfile(request: Request): Promise<ProfileAuthContext> {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    throw new ProfileAuthError(401, 'Jeton manquant.')
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    throw new ProfileAuthError(500, 'Configuration Supabase serveur manquante.')
  }

  const serviceClient = createClient<Database>(url, serviceKey)

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token)
  if (userError || !userData.user) {
    throw new ProfileAuthError(401, 'Jeton invalide.')
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, role, status, etablissement_id, prospect_id')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile) {
    throw new ProfileAuthError(403, 'Profil introuvable.')
  }

  const { data: platformAdmin } = await serviceClient
    .from('platform_admins')
    .select('id')
    .eq('id', profile.id)
    .maybeSingle()

  /* Étudiant converti depuis un prospect : validé par l'admin au moment même de la conversion.
     Jusqu'au correctif du 2026-09-29, convert-prospect.ts oubliait de passer ces comptes en
     'approved' — ils restaient 'pending' et se voyaient refuser leur propre agenda. Toléré ici
     tant que la migration 0084 (régularisation des comptes existants) n'est pas appliquée. */
  const etudiantConverti = profile.role === 'etudiant' && profile.status === 'pending' && !!profile.prospect_id

  if (!platformAdmin && profile.status !== 'approved' && !etudiantConverti) {
    throw new ProfileAuthError(403, 'Compte non approuvé.')
  }
  const estAdminEtablissement = !!platformAdmin || profile.role === 'admin_etablissement'

  return {
    serviceClient,
    profileId: profile.id,
    etablissementId: profile.etablissement_id,
    role: profile.role,
    estAdminEtablissement,
  }
}
