import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { envoyerEmail, modeleRelanceProspect } from '../_lib/email.js'

export const config = { runtime: 'edge' }

interface Corps {
  prospectId?: string
}

/**
 * Relance manuelle d'un prospect en « Diagnostic réalisé » — demande client du 2026-09-21 : un
 * rappel du forfait à choisir, du rythme à trancher, et des avantages de l'établissement. Passe
 * par le serveur (comme les autres envois Resend) pour garder la clé d'API hors du client, même
 * si l'action elle-même ne modifie aucune donnée.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.prospectId) {
      return Response.json({ error: 'prospectId est requis.' }, { status: 400 })
    }

    const { data: prospect } = await serviceClient
      .from('prospects')
      .select('id, etablissement_id, prenom, email, statut')
      .eq('id', corps.prospectId)
      .maybeSingle()
    if (!prospect || prospect.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Prospect introuvable pour cet établissement.' }, { status: 404 })
    }

    const { data: etablissement } = await serviceClient.from('etablissements').select('nom').eq('id', etablissementId).maybeSingle()

    const { envoye, erreur } = await envoyerEmail({
      destinataire: prospect.email,
      sujet: `On vous attend chez ${etablissement?.nom ?? 'Hari Online Club'} !`,
      html: modeleRelanceProspect({ prenom: prospect.prenom, etablissement: etablissement?.nom ?? 'Hari Online Club' }),
    })
    if (!envoye) {
      return Response.json({ error: erreur ?? "L'e-mail n'a pas pu être envoyé. Vérifiez la configuration Resend." }, { status: 502 })
    }

    return Response.json({ ok: true })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
