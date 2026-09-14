import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

// Déconnexion du compte Google de l'établissement : la ligne est supprimée, donc le jeton de
// rafraîchissement chiffré avec elle. Les séances déjà créées gardent leur lien Meet (les
// réunions restent valides côté Google) ; seules les prochaines séances repasseront sur le lien
// interne tant qu'aucun compte n'est reconnecté.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const { error } = await serviceClient.from('google_integrations').delete().eq('etablissement_id', etablissementId)
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
