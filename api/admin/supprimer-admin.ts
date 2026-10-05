import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

/**
 * Retire un administrateur de l'établissement — demande client du 2026-10-05 (symétrique de
 * l'invitation, api/admin/inviter-admin.ts). Volontairement plus simple que
 * api/admin/supprimer-utilisateur.ts (étudiant/professeur) : un admin n'a ni séances, ni heures,
 * ni forfait, ni contrat à son nom de destinataire — rien de pédagogique à purger. Ce qu'il a pu
 * créer (reçus, notifications envoyées, messages…) reste tel quel, comme pour n'importe quel
 * `created_by_profile_id` historique ailleurs dans l'application.
 *
 * Deux garde-fous qu'une suppression de professeur/étudiant n'a pas besoin d'avoir :
 *   - impossible de se retirer soi-même (même règle déjà en place côté étudiant/professeur) ;
 *   - impossible de retirer le DERNIER admin de l'établissement — sans lui, plus personne ne
 *     pourrait plus jamais se connecter à l'espace admin pour en recréer un (et la console
 *     « Admin plateforme » n'est pas un chemin que l'admin d'établissement lui-même peut
 *     atteindre).
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
      return Response.json({ error: 'Vous ne pouvez pas retirer votre propre accès.' }, { status: 400 })
    }

    const { data: cible, error: erreurCible } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id')
      .eq('id', body.profileId)
      .maybeSingle()
    if (erreurCible || !cible || cible.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Compte introuvable.' }, { status: 404 })
    }
    if (cible.role !== 'admin_etablissement') {
      return Response.json({ error: 'Ce compte n’est pas un administrateur.' }, { status: 403 })
    }

    const { count } = await serviceClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('etablissement_id', etablissementId)
      .eq('role', 'admin_etablissement')
      .neq('status', 'suspended')
    if ((count ?? 0) <= 1) {
      return Response.json({ error: 'Impossible de retirer le dernier administrateur de l’établissement.' }, { status: 400 })
    }

    const { error: erreurStatut } = await serviceClient
      .from('profiles')
      .update({ status: 'suspended', email: null })
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
