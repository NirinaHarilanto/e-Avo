import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

/**
 * Supprime un étudiant ou un professeur depuis l'espace admin. Un vrai DELETE sur `profiles`
 * échouerait dès que la personne a le moindre historique : `teacher_assignments`, `sessions`,
 * `hour_ledger`, `invoices`, `documents`, `contracts`, `notifications`... référencent toutes
 * `profiles(id)` sans `on delete cascade` (délibérément, pour ne jamais perdre une trace
 * financière/pédagogique par un delete silencieux — voir supprimer-ligne-financiere.ts).
 *
 * On fait donc une suppression douce : `status = 'suspended'` (valeur du type `statut_profil`
 * jamais utilisée jusqu'ici, migration 0002) retire la personne des listes actives, et le compte
 * Auth est soft-deleted (`deleteUser(id, true)` — e-mail anonymisé côté GoTrue, jetons révoqués,
 * connexion définitivement impossible) SANS supprimer la ligne `auth.users` : `profiles.id` reste
 * une référence valide, tout l'historique lié reste intact et correctement attribué.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId, profileId } = await requireAdmin(request)
    const body = (await request.json()) as { profileId?: string }
    if (!body.profileId) {
      return Response.json({ error: 'Identifiant manquant.' }, { status: 400 })
    }
    if (body.profileId === profileId) {
      return Response.json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, { status: 400 })
    }

    const { data: cible, error: erreurCible } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id')
      .eq('id', body.profileId)
      .maybeSingle()

    if (erreurCible || !cible || cible.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Compte introuvable.' }, { status: 404 })
    }
    if (cible.role !== 'etudiant' && cible.role !== 'professeur') {
      return Response.json({ error: 'Seuls les comptes étudiant ou professeur peuvent être supprimés ici.' }, { status: 403 })
    }

    const { error: erreurStatut } = await serviceClient
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', body.profileId)
    if (erreurStatut) {
      return Response.json({ error: erreurStatut.message }, { status: 500 })
    }

    const { error: erreurAuth } = await serviceClient.auth.admin.deleteUser(body.profileId, true)
    if (erreurAuth) {
      return Response.json({ error: erreurAuth.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
