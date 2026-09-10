import { requirePlatformAdmin, PlatformAdminAuthError } from '../_lib/platformAuth.js'
import { creerCompteSansEmail } from '../_lib/creerCompte.js'

export const config = { runtime: 'edge' }

// Seul point d'entrée capable de créer un admin_etablissement sans accès direct service_role
// à la base (résout le problème de bootstrap : sans lui, aucun établissement ne peut jamais
// avoir de premier admin, puisque toute promotion de rôle exige déjà d'être admin). L'appelant
// est un platform admin, pas l'admin de l'établissement cible — etablissementId vient donc
// explicitement du corps de la requête, jamais du contexte de l'appelant (voir platformAuth.ts).
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient } = await requirePlatformAdmin(request)
    const body = (await request.json()) as { email?: string; nom?: string; prenom?: string; etablissementId?: string }
    if (!body.email || !body.nom || !body.prenom || !body.etablissementId) {
      return Response.json({ error: 'Email, nom, prénom et établissement requis.' }, { status: 400 })
    }

    const { data: etablissement, error: etablissementError } = await serviceClient
      .from('etablissements')
      .select('id')
      .eq('id', body.etablissementId)
      .maybeSingle()
    if (etablissementError || !etablissement) {
      return Response.json({ error: 'Établissement introuvable.' }, { status: 404 })
    }

    const { data: invited, error: inviteError } = await creerCompteSansEmail(serviceClient, {
      email: body.email,
      etablissementId: body.etablissementId,
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
    if (error instanceof PlatformAdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
