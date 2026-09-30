/// <reference types="node" />
import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

/**
 * Suppression d'un compte rendu de séance par l'admin — demande client du 2026-09-30 : « rajoute
 * la possibilité de supprimer un compte rendu de séance, dans Mes documents, sous-section comptes
 * rendus ». `session_reports` n'a qu'une policy `for all` pour le PROFESSEUR AUTEUR
 * (session_reports_teacher_all, 0033) et une policy SELECT pour l'admin — jamais de DELETE admin
 * — d'où cette route en clé de service, même principe que api/documents/supprimer.ts.
 *
 * Nettoie d'abord les supports de cours joints (0087, `documents.session_report_id`) — fichier
 * Storage PUIS ligne `documents`, dans cet ordre — avant de supprimer le compte rendu lui-même :
 * la colonne est en `on delete set null`, elle ne le ferait pas toute seule, et laisserait des
 * fichiers orphelins autrement invisibles (plus aucune ligne ne les référencerait).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as { rapportId?: string }
    if (!body.rapportId) {
      return Response.json({ error: 'rapportId requis.' }, { status: 400 })
    }

    const { data: rapport, error: rapportError } = await serviceClient
      .from('session_reports')
      .select('id, etablissement_id')
      .eq('id', body.rapportId)
      .single()
    if (rapportError || !rapport || rapport.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Compte rendu introuvable.' }, { status: 404 })
    }

    const { data: supports } = await serviceClient.from('documents').select('id, storage_path').eq('session_report_id', rapport.id)
    if (supports && supports.length > 0) {
      const { error: storageError } = await serviceClient.storage.from('documents').remove(supports.map((d) => d.storage_path))
      if (storageError) {
        return Response.json({ error: storageError.message }, { status: 500 })
      }
      const { error: docsError } = await serviceClient
        .from('documents')
        .delete()
        .in('id', supports.map((d) => d.id))
      if (docsError) {
        return Response.json({ error: docsError.message }, { status: 500 })
      }
    }

    const { error: deleteError } = await serviceClient.from('session_reports').delete().eq('id', rapport.id)
    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
