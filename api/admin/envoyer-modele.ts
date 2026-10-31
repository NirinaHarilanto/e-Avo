import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { corpsEnHtml } from '../../src/lib/templatesEmail.js'
import { envoyerEmail } from '../_lib/email.js'
import { pieceJointeDuModele } from '../_lib/templatesEmail.js'

export const config = { runtime: 'edge' }

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Envoi RÉEL d'un message préparé depuis un modèle, par la boîte de l'établissement.
 *
 * Pourquoi cette route existe (demande client du 2026-10-31) : l'écran « Utiliser un modèle »
 * n'offrait que deux sorties — un message déposé dans l'espace personnel du destinataire, ou une
 * fenêtre Gmail ouverte dans le navigateur. Or le modèle 2.1 annonce « la procédure en pièce
 * jointe », et aucune des deux ne peut joindre un fichier : Gmail n'accepte pas qu'on lui passe
 * une pièce jointe par son URL de composition, et un message interne n'est pas un e-mail.
 *
 * Ce chemin-ci part du serveur, donc il peut tout faire d'un coup : joindre le document attaché
 * au modèle (0152), écrire à des gens qui n'ont pas de compte HOC, et savoir si l'envoi a
 * réellement abouti — ce que le bouton Gmail ne saura jamais (0117, le journal n'y note que
 * « préparé »).
 *
 * L'objet et le corps viennent de l'écran et non du modèle : l'administration les relit et les
 * retouche avant d'envoyer, c'est tout l'intérêt de la fenêtre d'aperçu. Le modèle ne sert ici
 * qu'à retrouver sa pièce jointe et à tracer l'envoi.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId, profileId } = await requireAdmin(request)
    const corps = (await request.json()) as {
      templateId?: string | null
      objet?: string
      corps?: string
      destinatairesProfileIds?: string[]
      copiesProfileIds?: string[]
      /* Adresses saisies à la main, pour écrire à quelqu'un qui n'a pas de compte (un prospect,
         le plus souvent). Elles ne peuvent pas entrer dans `destinataires_profile_ids`, qui est
         un tableau d'uuid (0091) — seul le journal des adresses les garde. */
      adresses?: string[]
      adressesCopies?: string[]
    }

    const objet = corps.objet?.trim()
    const texte = corps.corps?.trim()
    if (!objet) return Response.json({ error: "L'objet est obligatoire." }, { status: 400 })
    if (!texte) return Response.json({ error: 'Le message est vide.' }, { status: 400 })

    const profilsPrincipaux = [...new Set(corps.destinatairesProfileIds ?? [])]
    const profilsCopies = [...new Set(corps.copiesProfileIds ?? [])].filter((id) => !profilsPrincipaux.includes(id))

    /* Adresses relues depuis `profiles` avec la clé de service, et bornées à l'établissement :
       l'écran envoie des identifiants, jamais des adresses — un appel fabriqué à la main ne doit
       pas pouvoir faire écrire HOC à n'importe qui en se réclamant d'un profil. */
    const { data: profils } = await serviceClient
      .from('profiles')
      .select('id, email')
      .eq('etablissement_id', etablissementId)
      .in('id', [...profilsPrincipaux, ...profilsCopies])

    const emailParId = new Map((profils ?? []).map((p) => [p.id, p.email]))
    const nettoyer = (liste: string[] | undefined) =>
      [...new Set((liste ?? []).map((a) => a.trim().toLowerCase()).filter((a) => EMAIL_VALIDE.test(a)))]

    const destinataires = [
      ...profilsPrincipaux.map((id) => emailParId.get(id)).filter((e): e is string => !!e),
      ...nettoyer(corps.adresses),
    ]
    const copies = [
      ...profilsCopies.map((id) => emailParId.get(id)).filter((e): e is string => !!e),
      ...nettoyer(corps.adressesCopies),
    ].filter((e) => !destinataires.includes(e))

    if (destinataires.length === 0) {
      return Response.json({ error: 'Aucun destinataire ne porte d’adresse e-mail connue.' }, { status: 400 })
    }

    /* Pièce jointe du modèle (0152) : la procédure pour le modèle 2.1. Absente ou illisible, le
       message part quand même — voir `pieceJointeDuModele`. */
    let pieceJointeId: string | null = null
    if (corps.templateId) {
      const { data: modele } = await serviceClient
        .from('email_templates')
        .select('piece_jointe_document_id')
        .eq('id', corps.templateId)
        .eq('etablissement_id', etablissementId)
        .maybeSingle()
      pieceJointeId = modele?.piece_jointe_document_id ?? null
    }
    const piece = await pieceJointeDuModele(serviceClient, pieceJointeId)

    const { data: etablissement } = await serviceClient
      .from('etablissements')
      .select('telephone, email')
      .eq('id', etablissementId)
      .maybeSingle()

    const { envoye, erreur } = await envoyerEmail({
      destinataire: destinataires,
      copies,
      sujet: objet,
      html: corpsEnHtml(texte),
      piecesJointes: piece ? [piece] : [],
      contact: etablissement ?? undefined,
    })

    /* Journalisé dans les deux cas, et avec son vrai statut : c'est précisément ce que le chemin
       Gmail ne peut pas faire. Un échec de journal ne change rien à l'e-mail déjà parti — on le
       signale sans transformer un envoi réussi en erreur. */
    const { error: erreurJournal } = await serviceClient.from('email_envois').insert({
      etablissement_id: etablissementId,
      template_id: corps.templateId ?? null,
      destinataires_profile_ids: profilsPrincipaux,
      copies_profile_ids: profilsCopies,
      destinataires_emails: [...destinataires, ...copies],
      objet,
      corps: texte,
      piece_jointe_nom: piece?.nom ?? null,
      statut: envoye ? 'envoye' : 'echec',
      erreur: envoye ? null : (erreur ?? null),
      envoye_le: envoye ? new Date().toISOString() : null,
      cree_par_profile_id: profileId,
    })

    if (!envoye) {
      return Response.json({ error: erreur ?? "L'envoi a échoué." }, { status: 502 })
    }

    return Response.json({
      envoye: true,
      destinataires: destinataires.length,
      copies: copies.length,
      pieceJointe: piece?.nom ?? null,
      journal: erreurJournal ? erreurJournal.message : null,
    })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
