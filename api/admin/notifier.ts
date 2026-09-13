import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerNotification } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  destinataireProfileId?: string
  type?: string
  titre?: string
  message?: string
  lien?: string
}

// Point d'entrée générique pour qu'un admin notifie un étudiant ou un professeur de son
// établissement — "Envoyer" une facture, un rappel de signature de contrat, etc. Réutilisé par
// plusieurs écrans plutôt qu'un endpoint dédié par cas d'usage.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.destinataireProfileId || !body.type || !body.titre) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: destinataire } = await serviceClient
      .from('profiles')
      .select('id, etablissement_id')
      .eq('id', body.destinataireProfileId)
      .single()
    if (!destinataire || destinataire.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Destinataire invalide pour cet établissement.' }, { status: 400 })
    }

    await creerNotification(serviceClient, {
      etablissementId,
      destinataireProfileId: body.destinataireProfileId,
      type: body.type,
      titre: body.titre,
      message: body.message,
      lien: body.lien,
    })

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
