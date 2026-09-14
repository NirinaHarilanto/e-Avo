import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  sessionId?: string
  approuver?: boolean
}

// Valide ou refuse la reprogrammation proposée par un professeur (voir
// api/professeur/proposer-changement-seance.ts). Approuvée : les colonnes réelles debut/
// duree_minutes prennent la valeur proposée — les cumuls d'heures s'appuient sur elles
// (hour_ledger n'est écrit qu'à la clôture, voir cloturer-seance.ts), donc rien d'autre à
// recalculer ici. Refusée : la proposition est simplement effacée, la séance garde son horaire
// d'origine.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.sessionId || typeof body.approuver !== 'boolean') {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: session, error: sessionError } = await serviceClient
      .from('sessions')
      .select('*')
      .eq('id', body.sessionId)
      .single()

    if (sessionError || !session || session.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Séance introuvable.' }, { status: 404 })
    }
    if (session.changement_statut !== 'en_attente') {
      return Response.json({ error: 'Aucun changement en attente pour cette séance.' }, { status: 409 })
    }

    const { error: updateError } = await serviceClient
      .from('sessions')
      .update(
        body.approuver
          ? {
              debut: session.debut_propose ?? session.debut,
              duree_minutes: session.duree_minutes_propose ?? session.duree_minutes,
              debut_propose: null,
              duree_minutes_propose: null,
              changement_statut: 'aucun',
            }
          : {
              debut_propose: null,
              duree_minutes_propose: null,
              justificatif_changement: null,
              changement_demande_par: null,
              changement_statut: 'aucun',
            },
      )
      .eq('id', session.id)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
