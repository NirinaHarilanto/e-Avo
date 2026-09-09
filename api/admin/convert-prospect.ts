import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

// Conversion Prospect -> Étudiant (pipeline, étape finale). Le prospect n'a pas de compte
// Auth avant cet appel : on invite l'email par Supabase Auth (déclenche handle_new_user,
// qui crée `profiles`), puis on relie le nouveau profil au prospect d'origine sans jamais
// dupliquer ou migrer la ligne `prospects` — diagnostic_calls.prospect_id reste la clé
// stable avant et après conversion.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as { prospectId?: string }
    if (!body.prospectId) {
      return Response.json({ error: 'prospectId requis.' }, { status: 400 })
    }

    const { data: prospect, error: prospectError } = await serviceClient
      .from('prospects')
      .select('*')
      .eq('id', body.prospectId)
      .eq('etablissement_id', etablissementId)
      .single()

    if (prospectError || !prospect) {
      return Response.json({ error: 'Prospect introuvable pour cet établissement.' }, { status: 404 })
    }

    const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
      prospect.email,
      {
        data: {
          etablissement_id: etablissementId,
          nom: prospect.nom,
          prenom: prospect.prenom,
        },
      },
    )
    if (inviteError || !invited.user) {
      return Response.json({ error: inviteError?.message ?? "Échec de l'invitation." }, { status: 500 })
    }

    await serviceClient.from('profiles').update({ prospect_id: prospect.id }).eq('id', invited.user.id)
    await serviceClient.from('prospects').update({ statut: 'etudiant' }).eq('id', prospect.id)

    return Response.json({ profileId: invited.user.id })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
