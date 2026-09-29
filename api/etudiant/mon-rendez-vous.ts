/// <reference types="node" />
import { ProfileAuthError, requireApprovedProfile } from '../_lib/profileAuth.js'

export const config = { runtime: 'edge' }

interface ParticipantResolu {
  id: string
  prenom: string | null
  nom: string | null
  role: string
}

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
 *
 * Détails enrichis le 2026-09-29 (pièce jointe client, agenda trop pauvre : « mettre les
 * informations nécessaires telles que les personnes incluses dans l'invitation... mets
 * également visible les détails du rendez-vous ») :
 *  - un événement « autre » (evenements_admin) expose désormais ses participants obligatoires/
 *    optionnels résolus en {id, prenom, nom, role} — même forme que côté admin (voir
 *    useEvenementsAdmin.ts, ParticipantEvenement), pour réutiliser le même rendu — et ses notes ;
 *  - un rendez-vous d'appel diagnostic expose son interlocuteur (`valide_par`, l'admin qui l'a
 *    confirmé — seule personne de l'établissement réellement associée à CE rendez-vous, `rendez_vous`
 *    ne portant pas de liste d'invités comme `evenements_admin`) et le message laissé à la
 *    réservation.
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
    const [{ data: obligatoiresBruts }, { data: optionnelsBruts }] = await Promise.all([
      serviceClient
        .from('evenements_admin')
        .select('id, titre, debut, duree_minutes, lien_meet, notes, participants_obligatoires, participants_optionnels')
        .eq('annule', false)
        .contains('participants_obligatoires', [profileId]),
      serviceClient
        .from('evenements_admin')
        .select('id, titre, debut, duree_minutes, lien_meet, notes, participants_obligatoires, participants_optionnels')
        .eq('annule', false)
        .contains('participants_optionnels', [profileId]),
    ])
    const evenementsBruts = [...new Map([...(obligatoiresBruts ?? []), ...(optionnelsBruts ?? [])].map((e) => [e.id, e])).values()]

    const { data: profil } = await serviceClient.from('profiles').select('prospect_id').eq('id', profileId).maybeSingle()

    const rendezVousBruts = profil?.prospect_id
      ? (
          await serviceClient
            .from('rendez_vous')
            .select('id, debut, duree_minutes, statut, lien_meet, message, valide_par')
            .eq('prospect_id', profil.prospect_id)
            .in('statut', ['en_attente', 'confirme'])
            .order('debut', { ascending: true })
        ).data
      : []
    if (rendezVousBruts === null) {
      return Response.json({ error: 'Rendez-vous indisponible.' }, { status: 500 })
    }

    /* Un seul aller-retour pour résoudre tous les profils cités, événements comme rendez-vous
       (participants + interlocuteur) — plutôt qu'une requête par ligne. */
    const idsAResoudre = new Set<string>()
    for (const e of evenementsBruts) {
      for (const id of [...e.participants_obligatoires, ...e.participants_optionnels]) idsAResoudre.add(id)
    }
    for (const r of rendezVousBruts) {
      if (r.valide_par) idsAResoudre.add(r.valide_par)
    }
    const { data: profils } = idsAResoudre.size
      ? await serviceClient.from('profiles').select('id, prenom, nom, role').in('id', [...idsAResoudre])
      : { data: [] as ParticipantResolu[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

    const evenements = evenementsBruts.map(({ participants_obligatoires, participants_optionnels, ...e }) => ({
      ...e,
      obligatoires: participants_obligatoires.map((id) => profilParId.get(id)).filter((p): p is ParticipantResolu => !!p),
      optionnels: participants_optionnels.map((id) => profilParId.get(id)).filter((p): p is ParticipantResolu => !!p),
    }))

    const rendezVous = rendezVousBruts.map(({ valide_par, ...r }) => ({
      ...r,
      interlocuteur: valide_par ? (profilParId.get(valide_par) ?? null) : null,
    }))

    return Response.json({ rendezVous, evenements })
  } catch (erreur) {
    if (erreur instanceof ProfileAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
