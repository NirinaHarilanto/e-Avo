import { requireApprovedProfile, ProfileAuthError } from '../_lib/profileAuth.js'

export const config = { runtime: 'edge' }

// Point d'entrée unique pour supprimer un document : retire l'objet Storage PUIS la ligne
// `documents`, dans cet ordre, pour que si l'un des deux échoue on ne se retrouve jamais avec
// une ligne de métadonnées pointant vers un fichier déjà supprimé (l'inverse serait pire : un
// fichier orphelin sans métadonnées est inoffensif, une ligne sans fichier casse l'UI).
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, role } = await requireApprovedProfile(request)
    const body = (await request.json()) as { documentId?: string }
    if (!body.documentId) {
      return Response.json({ error: 'documentId requis.' }, { status: 400 })
    }

    const { data: document, error: documentError } = await serviceClient
      .from('documents')
      .select('*')
      .eq('id', body.documentId)
      .single()
    if (documentError || !document) {
      return Response.json({ error: 'Document introuvable.' }, { status: 404 })
    }
    if (document.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Document introuvable.' }, { status: 404 })
    }

    const autorise = role === 'admin_etablissement' || document.uploaded_by_profile_id === profileId
    if (!autorise) {
      return Response.json({ error: 'Suppression non autorisée.' }, { status: 403 })
    }

    const { error: storageError } = await serviceClient.storage.from('documents').remove([document.storage_path])
    if (storageError) {
      return Response.json({ error: storageError.message }, { status: 500 })
    }

    const { error: deleteError } = await serviceClient.from('documents').delete().eq('id', document.id)
    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof ProfileAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
