import { requireApprovedProfile, ProfileAuthError } from '../_lib/profileAuth.js'
import { creerNotification } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

// Point d'entrée unique pour supprimer un document : retire l'objet Storage PUIS la ligne
// `documents`, dans cet ordre, pour que si l'un des deux échoue on ne se retrouve jamais avec
// une ligne de métadonnées pointant vers un fichier déjà supprimé (l'inverse serait pire : un
// fichier orphelin sans métadonnées est inoffensif, une ligne sans fichier casse l'UI).
//
// Autorisation élargie le 2026-10-10 (règle client) : « tout utilisateur peut supprimer un
// document [...] s'il est propriétaire du document, il pourra supprimer le document ». Le
// PROPRIÉTAIRE (`owner_profile_id`) peut désormais toujours supprimer, même s'il n'a rien
// uploadé lui-même — cas réel : un admin dépose un contrat signé dans le dossier d'un professeur
// (`owner_profile_id` = le professeur, `uploaded_by_profile_id` = l'admin, voir ContratsAdmin.tsx
// et le commentaire de 0059) ; sans cet ajout, le professeur propriétaire ne pouvait pas
// supprimer sa propre pièce. Les deux autorisations précédentes (admin de l'établissement,
// déposant) restent telles quelles — purement additif, aucune régression possible.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, estAdminEtablissement } = await requireApprovedProfile(request)
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

    const autorise =
      estAdminEtablissement || document.uploaded_by_profile_id === profileId || document.owner_profile_id === profileId
    if (!autorise) {
      return Response.json({ error: 'Suppression non autorisée.' }, { status: 403 })
    }

    /* Qui partage la vue de ce document, lu AVANT la suppression : `document_partages` porte un
       `on delete cascade` sur `documents` (0059), ces lignes disparaîtraient donc avec le
       document si on les lisait après. Client de service : on veut TOUS les destinataires, quel
       que soit qui a émis le partage, peu importe les policies RLS de l'appelant. */
    const { data: partages } = await serviceClient
      .from('document_partages')
      .select('destinataire_profile_id')
      .eq('document_id', document.id)

    const { error: storageError } = await serviceClient.storage.from('documents').remove([document.storage_path])
    if (storageError) {
      return Response.json({ error: storageError.message }, { status: 500 })
    }

    const { error: deleteError } = await serviceClient.from('documents').delete().eq('id', document.id)
    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 })
    }

    /* Chaque destinataire d'un partage est prévenu que le document a disparu — règle client du
       2026-10-10 : « les personnes qui ont une vue sur le document supprimé auront uniquement une
       notification de suppression ». Jamais bloquant : le document est déjà supprimé, une
       notification manquée n'est pas rattrapable en refusant la requête après coup. */
    const destinataires = [...new Set((partages ?? []).map((p) => p.destinataire_profile_id))]
    await Promise.all(
      destinataires.map((destinataireProfileId) =>
        creerNotification(serviceClient, {
          etablissementId,
          destinataireProfileId,
          type: 'document_supprime',
          titre: 'Document supprimé',
          message: `« ${document.nom_original} », que vous aviez reçu en partage, a été supprimé par son propriétaire. Il ne figure plus dans « Mes fichiers partagés ».`,
        }).catch(() => undefined),
      ),
    )

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof ProfileAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
