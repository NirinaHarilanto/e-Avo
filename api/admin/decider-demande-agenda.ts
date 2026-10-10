import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerNotification } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  demandeId?: string
  decision?: 'approuver' | 'refuser'
  motifRefus?: string
}

/**
 * Décision de l'administration sur une demande de changement de compte Google d'un professeur
 * (0112) — « la validation sera faite uniquement par l'admin » (exigence client du 2026-10-10).
 *
 * Approuver n'écrit rien dans l'intégration : cela ouvre seulement, pour CETTE adresse précise, le
 * droit de relancer la connexion Google. Personne ne peut autoriser un agenda à la place de son
 * titulaire — Google exige que chacun passe son propre écran de consentement.
 *
 * Route serveur plutôt qu'écriture directe (la policy admin le permettrait) pour prévenir le
 * professeur : sans notification, il attendrait une réponse déjà donnée.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json().catch(() => ({}))) as Corps

    if (!corps.demandeId || (corps.decision !== 'approuver' && corps.decision !== 'refuser')) {
      return Response.json({ error: 'Requête incomplète.' }, { status: 400 })
    }

    const { data: demande } = await serviceClient
      .from('demandes_agenda_google')
      .select('id, profile_id, google_email_souhaite, google_email_actuel, statut')
      .eq('id', corps.demandeId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()

    if (!demande) {
      return Response.json({ error: 'Demande introuvable.' }, { status: 404 })
    }
    /* Seule une demande encore en attente se tranche : repasser sur une demande déjà approuvée et
       consommée rouvrirait un droit de reconnexion que l'admin n'a pas voulu accorder deux fois. */
    if (demande.statut !== 'en_attente') {
      return Response.json({ error: 'Cette demande a déjà été traitée.' }, { status: 409 })
    }

    const approuvee = corps.decision === 'approuver'
    const { error } = await serviceClient
      .from('demandes_agenda_google')
      .update({
        statut: approuvee ? 'approuvee' : 'refusee',
        decide_par: profileId,
        decide_le: new Date().toISOString(),
        motif_refus: approuvee ? null : corps.motifRefus?.trim() || null,
      })
      .eq('id', demande.id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    await creerNotification(serviceClient, {
      etablissementId,
      destinataireProfileId: demande.profile_id,
      type: 'demande_agenda_google_decidee',
      titre: approuvee ? 'Changement de compte Google autorisé' : 'Changement de compte Google refusé',
      message: approuvee
        ? `Vous pouvez désormais relier votre agenda à ${demande.google_email_souhaite}. Ouvrez « Mon profil » et lancez la connexion : l'autorisation ne vaut que pour cette adresse, et pour une seule fois.`
        : `L'administration n'a pas autorisé le passage à ${demande.google_email_souhaite}.${corps.motifRefus?.trim() ? ` Motif : ${corps.motifRefus.trim()}` : ''}`,
      lien: '/professeur/mon-profil',
    }).catch(() => undefined)

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
