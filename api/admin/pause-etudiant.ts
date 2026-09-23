import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  profileId?: string
  decision?: 'pause' | 'reactiver'
  motif?: string
}

/**
 * Met un étudiant en pause, ou lève une pause déjà posée (0063, demande client du 2026-09-23).
 *
 * Passe par le backend (service_role) parce que `profiles.status` est verrouillé côté client par
 * le trigger `empecher_promotion_profil` (0015/0047) — un admin ne peut pas le modifier lui-même
 * depuis le navigateur, exactement comme pour la suppression (supprimer-utilisateur.ts).
 *
 * Distincte de la suppression douce : `en_pause` (contrairement à `suspended`) reste visible dans
 * les listes (`useEtudiants`/`useProfesseurs` n'excluent que `suspended`) et n'anonymise ni ne
 * révoque le compte Auth — la personne peut continuer à se connecter, c'est réversible en un clic.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId, profileId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    if (!corps.profileId || (corps.decision !== 'pause' && corps.decision !== 'reactiver')) {
      return Response.json({ error: 'Identifiant et décision sont obligatoires.' }, { status: 400 })
    }
    if (corps.decision === 'pause' && !corps.motif?.trim()) {
      return Response.json({ error: 'Un motif est obligatoire pour mettre en pause.' }, { status: 400 })
    }

    const { data: cible, error: erreurCible } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id, status')
      .eq('id', corps.profileId)
      .maybeSingle()

    if (erreurCible || !cible || cible.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Compte introuvable.' }, { status: 404 })
    }
    if (cible.role !== 'etudiant') {
      return Response.json({ error: 'Seul un compte étudiant peut être mis en pause ici.' }, { status: 403 })
    }

    if (corps.decision === 'pause') {
      if (cible.status !== 'approved') {
        return Response.json({ error: 'Seul un étudiant actif peut être mis en pause.' }, { status: 400 })
      }
      const { error } = await serviceClient
        .from('profiles')
        .update({
          status: 'en_pause',
          motif_pause: corps.motif!.trim(),
          pause_le: new Date().toISOString(),
          pause_par: profileId,
        })
        .eq('id', corps.profileId)
      if (error) return Response.json({ error: error.message }, { status: 500 })
    } else {
      if (cible.status !== 'en_pause') {
        return Response.json({ error: "Ce compte n'est pas en pause." }, { status: 400 })
      }
      // motif_pause/pause_le/pause_par volontairement conservés : historique de la dernière
      // pause, pas remis à null par une réactivation (voir commentaire de la colonne, 0063).
      const { error } = await serviceClient.from('profiles').update({ status: 'approved' }).eq('id', corps.profileId)
      if (error) return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
