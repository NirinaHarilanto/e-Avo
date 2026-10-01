import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { corpsEnHtml } from '../../src/lib/templatesEmail.js'
import { envoyerEmail } from '../_lib/email.js'

export const config = { runtime: 'edge' }

interface Corps {
  /* Identifiant de l'envoi déjà enregistré en brouillon, s'il y en a un : l'envoi met alors ce
     brouillon à jour au lieu d'en créer une seconde ligne. */
  envoiId?: string
  templateId?: string
  destinataireIds?: string[]
  copieIds?: string[]
  objet?: string
  corps?: string
  pieceJointeNom?: string
  /* Chemin dans le bucket `pieces-jointes-emails` d'un fichier déjà déposé par le navigateur. Le
     serveur le relit avec la clé de service pour le joindre — le contenu ne transite pas dans ce
     corps JSON, dont la taille est bornée par la plateforme. */
  pieceJointeChemin?: string
}

/**
 * Envoi d'un e-mail préparé depuis un modèle (0091) — demande client du 2026-10-01 : le pop-up
 * « Utiliser » montre un aperçu modifiable, puis « Envoyer ».
 *
 * Le corps part tel que l'admin l'a relu dans l'aperçu : la substitution a déjà eu lieu côté
 * navigateur et il a pu le corriger. Le serveur ne retouche plus le texte — il résout les adresses
 * e-mail, joint le fichier, envoie, et journalise ce qui est parti et à quelles adresses.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    const destinataireIds = [...new Set(corps.destinataireIds ?? [])]
    const copieIds = [...new Set(corps.copieIds ?? [])].filter((id) => !destinataireIds.includes(id))
    if (destinataireIds.length === 0) {
      return Response.json({ error: 'Choisissez au moins un destinataire obligatoire.' }, { status: 400 })
    }
    if (!corps.objet?.trim() || !corps.corps?.trim()) {
      return Response.json({ error: "L'objet et le message sont obligatoires." }, { status: 400 })
    }

    const { data: personnes } = await serviceClient
      .from('profiles')
      .select('id, email, prenom, nom')
      .in('id', [...destinataireIds, ...copieIds])
      .eq('etablissement_id', etablissementId)
      .neq('status', 'suspended')

    const emailParId = new Map((personnes ?? []).map((p) => [p.id, p.email]))
    const sansEmail = [...destinataireIds, ...copieIds].filter((id) => !emailParId.get(id))
    if (sansEmail.length > 0) {
      const noms = (personnes ?? [])
        .filter((p) => sansEmail.includes(p.id))
        .map((p) => [p.prenom, p.nom].filter(Boolean).join(' '))
      return Response.json(
        {
          error:
            noms.length > 0
              ? `Aucune adresse e-mail enregistrée pour : ${noms.join(', ')}. Complétez sa fiche avant l'envoi.`
              : "Un destinataire n'appartient pas à votre établissement.",
        },
        { status: 400 },
      )
    }

    const emails = destinataireIds.map((id) => emailParId.get(id)!).filter(Boolean)
    const emailsCopie = copieIds.map((id) => emailParId.get(id)!).filter(Boolean)

    /* Pièce jointe relue côté serveur : le navigateur l'a déposée dans le bucket privé
       `pieces-jointes-emails` (0094), seule la clé de service peut la redescendre pour l'encoder
       en base64. */
    let piecesJointes: { nom: string; contenuBase64: string }[] | undefined
    if (corps.pieceJointeChemin) {
      const { data: fichier, error: erreurFichier } = await serviceClient.storage
        .from('pieces-jointes-emails')
        .download(corps.pieceJointeChemin)
      if (erreurFichier || !fichier) {
        return Response.json({ error: "La pièce jointe n'a pas pu être relue. Réessayez de la joindre." }, { status: 400 })
      }
      const octets = new Uint8Array(await fichier.arrayBuffer())
      let binaire = ''
      for (const octet of octets) binaire += String.fromCharCode(octet)
      piecesJointes = [{ nom: corps.pieceJointeNom ?? 'piece-jointe', contenuBase64: btoa(binaire) }]
    }

    const resultat = await envoyerEmail({
      destinataire: emails,
      copies: emailsCopie.length > 0 ? emailsCopie : undefined,
      sujet: corps.objet.trim(),
      html: corpsEnHtml(corps.corps.trim()),
      piecesJointes,
    })

    /* Journalisé dans les deux cas, succès comme échec : l'admin doit pouvoir constater qu'un
       envoi a échoué et pourquoi, plutôt que de se demander si le mail est parti. */
    const ligne = {
      etablissement_id: etablissementId,
      template_id: corps.templateId ?? null,
      destinataires_profile_ids: destinataireIds,
      copies_profile_ids: copieIds,
      destinataires_emails: [...emails, ...emailsCopie],
      objet: corps.objet.trim(),
      corps: corps.corps.trim(),
      piece_jointe_nom: corps.pieceJointeNom ?? null,
      piece_jointe_chemin: corps.pieceJointeChemin ?? null,
      statut: (resultat.envoye ? 'envoye' : 'echec') as 'envoye' | 'echec',
      erreur: resultat.erreur ?? null,
      envoye_le: resultat.envoye ? new Date().toISOString() : null,
      cree_par_profile_id: profileId,
    }
    if (corps.envoiId) {
      await serviceClient.from('email_envois').update(ligne).eq('id', corps.envoiId).eq('etablissement_id', etablissementId)
    } else {
      await serviceClient.from('email_envois').insert(ligne)
    }

    if (!resultat.envoye) {
      return Response.json(
        {
          error:
            resultat.erreur === 'Resend non configuré.'
              ? "L'envoi d'e-mails n'est pas encore configuré sur le serveur (clé Resend absente). Le mail a été conservé dans le journal."
              : `L'envoi a échoué : ${resultat.erreur}`,
        },
        { status: 502 },
      )
    }

    return Response.json({ ok: true, destinataires: emails.length, copies: emailsCopie.length })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
