/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

/**
 * Crée un compte Auth sans envoi d'e-mail — remplace `inviteUserByEmail`, qui déclenche
 * systématiquement un e-mail via le système Supabase (pas encore fiable/configuré ici).
 * La notification/le lien de connexion seront branchés plus tard via Resend, à cet endroit
 * précis. `handle_new_user` (migration 0002) crée le profil à partir des mêmes métadonnées,
 * que le compte Auth soit créé via invite ou via createUser — aucun autre changement requis.
 */
export function creerCompteSansEmail(
  serviceClient: ReturnType<typeof createClient<Database>>,
  infos: { email: string; etablissementId: string; nom: string; prenom: string },
) {
  return serviceClient.auth.admin.createUser({
    email: infos.email,
    email_confirm: true,
    user_metadata: {
      etablissement_id: infos.etablissementId,
      nom: infos.nom,
      prenom: infos.prenom,
    },
  })
}
