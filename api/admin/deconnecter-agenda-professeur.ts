import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerNotification } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  profileId?: string
}

/**
 * Désynchronisation, PAR L'ADMINISTRATION, du Google Calendar personnel d'un professeur (0098) —
 * demande client du 2026-11-04 : « rajouter le bouton qui permet de désynchroniser le Google
 * Calendar d'un professeur et l'agenda HOC du professeur ».
 *
 * Distincte de api/google-personnel/deconnecter.ts, qui ne déconnecte QUE son propre compte et
 * exige, pour un professeur, une autorisation préalable (0112). Ici c'est l'administration elle-
 * même qui agit : elle EST l'autorité de validation, le verrou n'a donc pas lieu d'être. Il n'y
 * avait jusque-là aucun moyen de délier le compte d'un professeur parti, ou dont l'agenda restait
 * en erreur sans qu'il s'en occupe.
 *
 * La ligne est supprimée, donc le jeton avec elle. Rien n'est touché côté Google : le professeur
 * garde son agenda et ses réunions déjà créées, seule la liaison avec HOC disparaît. Ses
 * prochaines réunions repartiront du compte de l'établissement.
 *
 * `etablissement_id` est exigé dans le filtre : sans lui, un admin pourrait délier le compte d'un
 * professeur d'un AUTRE établissement en forgeant un identifiant.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId, profileId: adminId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    const profileId = corps.profileId?.trim()
    if (!profileId) {
      return Response.json({ error: 'Professeur manquant.' }, { status: 400 })
    }

    const { data: professeur } = await serviceClient
      .from('profiles')
      .select('id, prenom, nom, etablissement_id')
      .eq('id', profileId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()

    if (!professeur) {
      return Response.json({ error: 'Professeur introuvable dans votre établissement.' }, { status: 404 })
    }

    const { data: integration } = await serviceClient
      .from('google_integrations_personnelles')
      .select('google_email')
      .eq('profile_id', profileId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()

    if (!integration) {
      return Response.json({ error: 'Ce professeur n’a aucun agenda Google connecté.' }, { status: 409 })
    }

    const { error } = await serviceClient
      .from('google_integrations_personnelles')
      .delete()
      .eq('profile_id', profileId)
      .eq('etablissement_id', etablissementId)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    /* Le professeur est prévenu : sans cela, il découvrirait la rupture en constatant que ses
       cours ne partent plus de son agenda, sans comprendre pourquoi. */
    await creerNotification(serviceClient, {
      etablissementId,
      destinataireProfileId: profileId,
      type: 'agenda_google_deconnecte',
      titre: 'Votre agenda Google a été déconnecté',
      message: `L'administration a désynchronisé ${integration.google_email ?? 'votre compte Google'} de Hari Online Club. Vos prochaines réunions de cours repartiront du compte de l'établissement. Vous pouvez reconnecter votre agenda depuis « Mon profil ».`,
      lien: '/professeur/mon-profil',
    }).catch(() => undefined)

    /* Une demande de changement encore en attente n'a plus d'objet : la laisser ouverte ferait
       réapparaître le professeur dans la file des décisions pour un compte qui n'existe plus. */
    await serviceClient
      .from('demandes_agenda_google')
      .delete()
      .eq('profile_id', profileId)
      .eq('statut', 'en_attente')

    return Response.json({ ok: true, deconnectePar: adminId })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
