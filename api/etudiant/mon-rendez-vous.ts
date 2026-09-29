/// <reference types="node" />
import { ProfileAuthError, requireApprovedProfile } from '../_lib/profileAuth.js'

export const config = { runtime: 'edge' }

/**
 * Rendez-vous d'appel diagnostic de l'étudiant connecté — demande client du 2026-09-29 : après
 * sa conversion, Sandra ne retrouvait pas dans son agenda le rendez-vous du 30 septembre.
 * `rendez_vous` n'a qu'une policy admin (0042) : ce n'est pas un oubli, c'est la table où
 * arrivent les demandes de visiteurs anonymes, ouverte en écriture au seul serveur. Plutôt que
 * d'ouvrir une policy de lecture (migration à appliquer à la main), la lecture passe ici, avec
 * la clé service_role, restreinte au prospect que ce profil a été (`profiles.prospect_id`, posé
 * à la conversion, voir convert-prospect.ts).
 *
 * Seuls les rendez-vous encore actifs (à valider, confirmé) sont renvoyés : un rendez-vous
 * annulé ou refusé n'a plus rien à faire dans l'agenda d'un élève.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId } = await requireApprovedProfile(request)

    /* Rendez-vous « autre » (evenements_admin) où cet élève est participant : même raison que
       ci-dessous, la table n'a pas de policy de lecture pour un étudiant. Nécessaire pour que
       l'ajout / le retrait d'un participant se voie dans SON agenda (demande client du 2026-09-29). */
    const [{ data: obligatoires }, { data: optionnels }] = await Promise.all([
      serviceClient.from('evenements_admin').select('id, titre, debut, duree_minutes, lien_meet').eq('annule', false).contains('participants_obligatoires', [profileId]),
      serviceClient.from('evenements_admin').select('id, titre, debut, duree_minutes, lien_meet').eq('annule', false).contains('participants_optionnels', [profileId]),
    ])
    const evenements = [...new Map([...(obligatoires ?? []), ...(optionnels ?? [])].map((e) => [e.id, e])).values()]

    const { data: profil } = await serviceClient.from('profiles').select('prospect_id').eq('id', profileId).maybeSingle()
    if (!profil?.prospect_id) {
      return Response.json({ rendezVous: [], evenements })
    }

    const { data, error } = await serviceClient
      .from('rendez_vous')
      .select('id, debut, duree_minutes, statut, lien_meet')
      .eq('prospect_id', profil.prospect_id)
      .in('statut', ['en_attente', 'confirme'])
      .order('debut', { ascending: true })
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ rendezVous: data ?? [], evenements })
  } catch (erreur) {
    if (erreur instanceof ProfileAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
