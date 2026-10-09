import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerCompteSansEmail } from '../_lib/creerCompte.js'
import { trouverProfilHomonyme, messageHomonyme } from '../_lib/nomDuplique.js'

export const config = { runtime: 'edge' }

/**
 * Invitation d'un second (ou troisième…) administrateur de l'établissement — demande client du
 * 2026-10-05 : « plusieurs profils admin ajoutable depuis l'espace admin [...] accès de
 * plusieurs admin sur le même espace admin unique ». Même chemin que inviter-professeur.ts : la
 * promotion de rôle ne peut se faire que côté serveur avec service_role, `handle_new_user`
 * (migration 0002) forçant toujours role='etudiant' à la création.
 *
 * C'est désormais le SEUL chemin d'invitation d'un administrateur : la console « Admin
 * plateforme », qui servait au bootstrap du premier admin d'un nouvel établissement, a été retirée
 * le 2026-10-09, l'application ne servant qu'un établissement unique.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as { email?: string; nom?: string; prenom?: string }
    if (!body.email || !body.nom || !body.prenom) {
      return Response.json({ error: 'Email, nom et prénom requis.' }, { status: 400 })
    }

    const homonyme = await trouverProfilHomonyme(serviceClient, {
      etablissementId,
      role: 'admin_etablissement',
      nom: body.nom,
      prenom: body.prenom,
    })
    if (homonyme) {
      return Response.json({ error: messageHomonyme('admin_etablissement', homonyme) }, { status: 409 })
    }

    const { data: invited, error: inviteError } = await creerCompteSansEmail(serviceClient, {
      email: body.email,
      etablissementId,
      nom: body.nom,
      prenom: body.prenom,
    })
    if (inviteError || !invited.user) {
      return Response.json({ error: inviteError?.message ?? "Échec de la création du compte." }, { status: 500 })
    }

    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({ role: 'admin_etablissement', status: 'approved' })
      .eq('id', invited.user.id)
    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    return Response.json({ profileId: invited.user.id })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
