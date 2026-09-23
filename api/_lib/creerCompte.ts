/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

/**
 * Crée un compte Auth sans envoi d'e-mail — remplace `inviteUserByEmail`, qui déclenche
 * systématiquement un e-mail via le système Supabase (pas encore fiable/configuré ici).
 * La notification/le lien de connexion seront branchés plus tard via Resend, à cet endroit
 * précis. `handle_new_user` (migration 0002) crée le profil à partir des mêmes métadonnées,
 * que le compte Auth soit créé via invite ou via createUser — aucun autre changement requis.
 *
 * Utilisée par toute création de compte (invitation directe étudiant/professeur/admin,
 * conversion d'un prospect) — un seul point à corriger pour tous ces chemins.
 *
 * Auto-guérison d'un bug réel constaté le 2026-09-23 : un secondaire DUO invité (`status =
 * 'pending'`) dont le PRINCIPAL a ensuite été supprimé restait orphelin indéfiniment — son
 * compte Auth n'ayant jamais été supprimé avec celui du principal, il retenait son adresse
 * e-mail pour toujours et bloquait toute réinscription future avec la même adresse (message
 * Supabase brut « A user with this email address has already been registered », incompréhensible
 * tel quel pour l'admin). `créerCompteSansEmail` ne renonce donc plus au premier échec « déjà
 * enregistré » : elle regarde si l'adresse appartient à une invitation jamais activée
 * (`status = 'pending'`, donc sans aucune trace pédagogique/financière propre à perdre — tout
 * vivrait sur un éventuel principal, hors de propos ici), la nettoie exactement comme le ferait
 * un admin depuis `api/admin/supprimer-utilisateur.ts`, et retente une seule fois. Un compte
 * réellement actif (tout autre statut) n'est JAMAIS touché : l'erreur d'origine remonte telle
 * quelle, à l'admin de trancher.
 */
export async function creerCompteSansEmail(
  serviceClient: ReturnType<typeof createClient<Database>>,
  infos: { email: string; etablissementId: string; nom: string; prenom: string },
) {
  const creer = () =>
    serviceClient.auth.admin.createUser({
      email: infos.email,
      email_confirm: true,
      user_metadata: {
        etablissement_id: infos.etablissementId,
        nom: infos.nom,
        prenom: infos.prenom,
      },
    })

  const essai = await creer()
  if (!essai.error || !/already.*registered|email_exists/i.test(essai.error.message)) {
    return essai
  }

  const { data: existant } = await serviceClient
    .from('profiles')
    .select('id, status')
    .eq('email', infos.email)
    .maybeSingle()
  if (!existant || existant.status !== 'pending') {
    return essai
  }

  await serviceClient.from('profiles').update({ status: 'suspended', email: null }).eq('id', existant.id)
  await serviceClient.auth.admin.deleteUser(existant.id, true)

  return creer()
}
