import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

// Invitation d'un professeur. Comme pour la conversion prospect -> étudiant, la promotion de
// rôle ne peut se faire que côté serveur avec service_role : `handle_new_user` (migration 0002)
// force toujours role='etudiant' à la création, quel que soit le contenu envoyé par le client —
// la mise à jour vers 'professeur' ci-dessous s'exécute donc juste après, avec la même clé.
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

    const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(body.email, {
      data: { etablissement_id: etablissementId, nom: body.nom, prenom: body.prenom },
    })
    if (inviteError || !invited.user) {
      return Response.json({ error: inviteError?.message ?? "Échec de l'invitation." }, { status: 500 })
    }

    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({ role: 'professeur', status: 'approved' })
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
