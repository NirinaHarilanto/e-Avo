import { requireApprovedProfile, ProfileAuthError } from '../_lib/profileAuth.js'
import { creerNotification } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  destinataireIds?: string[]
  objet?: string
  corps?: string
  parentId?: string
}

/* Chemin de la section Messages selon l'espace du destinataire : la notification doit l'y amener
   directement, pas sur une page d'accueil où il devrait chercher. */
const LIEN_MESSAGES: Record<string, string> = {
  admin_etablissement: '/admin/messages',
  professeur: '/professeur/messages',
  etudiant: '/mon-espace/messages',
}

/**
 * Envoi d'un message interne (0090, demande client du 2026-10-01 : « chaque personne peut envoyer
 * un message à toute personne enregistrée dans l'application HOC »).
 *
 * Passe par le serveur et non par un insert direct depuis le navigateur pour une seule raison : la
 * notification qui prévient le destinataire. `notifications` n'a aucune policy d'insert cliente
 * (0028) — seule la clé de service peut en créer une, et sans elle un message resterait invisible
 * jusqu'à ce que la personne pense à ouvrir sa messagerie.
 *
 * La policy `messages_expediteur_insert` (0090/0092) reste en place et continue de protéger la
 * table : cet endpoint ne contourne pas la règle, il l'applique une seconde fois côté serveur
 * (expéditeur = appelant, destinataire présent dans l'annuaire de SON établissement).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireApprovedProfile(request)
    const corps = (await request.json()) as Corps

    const destinataireIds = [...new Set(corps.destinataireIds ?? [])]
    if (destinataireIds.length === 0) {
      return Response.json({ error: 'Choisissez au moins un destinataire.' }, { status: 400 })
    }
    if (!corps.objet?.trim()) {
      return Response.json({ error: "L'objet est obligatoire." }, { status: 400 })
    }
    if (!corps.corps?.trim()) {
      return Response.json({ error: 'Le message est vide.' }, { status: 400 })
    }

    /* Destinataires revalidés côté serveur : même établissement, compte non supprimé. La requête
       porte sur `profiles` avec la clé de service (la RLS ne s'y applique pas), donc elle voit
       bien tout le monde — contrairement à la sous-requête d'une policy, piège corrigé en 0092. */
    const { data: destinataires } = await serviceClient
      .from('profiles')
      .select('id, role, prenom, nom')
      .in('id', destinataireIds)
      .eq('etablissement_id', etablissementId)
      .neq('status', 'suspended')

    if (!destinataires || destinataires.length !== destinataireIds.length) {
      return Response.json({ error: "Un destinataire n'appartient pas à votre établissement." }, { status: 400 })
    }

    const { data: expediteur } = await serviceClient.from('profiles').select('prenom, nom').eq('id', profileId).single()
    const nomExpediteur = [expediteur?.prenom, expediteur?.nom].filter(Boolean).join(' ') || 'Un membre de HOC'

    /* Une ligne PAR destinataire, et non une ligne à destinataires multiples : c'est ce qui donne
       à chacun son propre état lu/non lu et sa propre conversation — un message lu par l'un ne
       doit pas apparaître lu chez l'autre. */
    const { error } = await serviceClient.from('messages').insert(
      destinataires.map((d) => ({
        etablissement_id: etablissementId,
        expediteur_profile_id: profileId,
        destinataire_profile_id: d.id,
        objet: corps.objet!.trim(),
        corps: corps.corps!.trim(),
        parent_id: corps.parentId ?? null,
      })),
    )
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    for (const d of destinataires) {
      // Jamais de notification à soi-même : s'écrire une note est permis, s'en alerter serait absurde.
      if (d.id === profileId) continue
      await creerNotification(serviceClient, {
        etablissementId,
        destinataireProfileId: d.id,
        type: 'message_recu',
        titre: `Message de ${nomExpediteur}`,
        message: corps.objet!.trim(),
        lien: LIEN_MESSAGES[d.role] ?? '/',
      })
    }

    return Response.json({ ok: true, envoyes: destinataires.length })
  } catch (error) {
    if (error instanceof ProfileAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
