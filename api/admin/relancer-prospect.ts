import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { envoyerEmail, modeleRelanceProspect } from '../_lib/email.js'
import { envoyerDepuisModele } from '../_lib/templatesEmail.js'
import { contexteRelanceProspect, motifProspect, REFERENCE_MODELE, type MotifProspect } from '../_lib/relance.js'

export const config = { runtime: 'edge' }

/* Deux relances possibles sur un prospect, depuis le 2026-10-19 :
   - `forfait_a_choisir` : la relance d'origine (2026-09-21), pour un prospect en « Diagnostic
     réalisé » qui n'a pas encore tranché son forfait ni son rythme (modèle 1.2) ;
   - `absence_diagnostic` : demande client 4, « si le prospect n'est pas présent lors du diagnostic
     call, on doit pouvoir le relancer via un bouton et un mail automatique » (modèle 1.3, ajouté
     par la migration 0130).
   Un seul endpoint : l'authentification, la vérification d'appartenance à l'établissement et la
   trace dans `relances` sont identiques, seul le modèle d'e-mail diffère.

   Le rassemblement des valeurs vit dans `_lib/relance.ts` depuis le 2026-11-21 : l'aperçu que
   l'administration relit avant d'envoyer doit composer EXACTEMENT le même message. */

interface Corps {
  prospectId?: string
  motif?: MotifProspect
  /* Le message relu, et le cas échéant retouché, dans la fenêtre d'aperçu. Absent, la route
     compose comme avant — l'ancien appel, qui envoyait sans relire, continue de fonctionner. */
  objet?: string
  corpsEmail?: string
}

/**
 * Relance manuelle d'un prospect. Passe par le serveur (comme les autres envois Resend) pour
 * garder la clé d'API hors du client.
 *
 * Écrit systématiquement dans `relances` (0130) — demande client du 2026-10-19 : « rajouter un
 * historique de relances pour les relances prospects, c'est-à-dire que l'on peut relancer
 * plusieurs fois un prospect ». Jusqu'ici, l'envoi ne laissait aucune trace : l'écran affichait
 * « Relance envoyée ✓ » jusqu'au prochain rechargement de page, et plus rien ensuite.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId, profileId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.prospectId) {
      return Response.json({ error: 'prospectId est requis.' }, { status: 400 })
    }
    const motif = motifProspect(corps.motif)

    const contexte = await contexteRelanceProspect(serviceClient, etablissementId, corps.prospectId, motif)
    if (!contexte) {
      return Response.json({ error: 'Prospect introuvable pour cet établissement.' }, { status: 404 })
    }

    const { data: etablissement } = await serviceClient.from('etablissements').select('nom').eq('id', etablissementId).maybeSingle()

    /* Un texte relu à l'écran part TEL QUEL : le resubstituer ne pourrait que défaire les
       retouches de l'administration. Sans texte fourni, la route compose depuis le modèle comme
       elle l'a toujours fait. */
    const relu = corps.objet?.trim() && corps.corpsEmail?.trim() ? { objet: corps.objet, corps: corps.corpsEmail } : undefined

    const reference = contexte.reference
    const parModele = await envoyerDepuisModele(serviceClient, {
      etablissementId,
      reference,
      destinataires: [contexte.email],
      valeurs: contexte.valeurs,
      texte: relu,
    })

    /* Repli sur le gabarit de code si le modèle a été supprimé ou désactivé : la relance est une
       action que l'admin vient de déclencher d'un clic, elle ne doit pas rester sans effet.
       Le gabarit de code ne couvre que la relance « forfait à choisir » — c'est le seul qui
       existait avant 0130, et un texte d'absence au diagnostic écrit en dur ici dupliquerait le
       modèle 1.3 sans que personne ne puisse le corriger. Si ce modèle-là manque, l'envoi échoue
       franchement et l'écran le dit. */
    const resultat = parModele.envoye
      ? parModele
      : motif === 'forfait_a_choisir'
        ? await envoyerEmail({
            destinataire: contexte.email,
            sujet: `On vous attend chez ${etablissement?.nom ?? 'Hari Online Club'} !`,
            html: modeleRelanceProspect({ prenom: contexte.valeurs.prenom ?? '', etablissement: etablissement?.nom ?? 'Hari Online Club' }),
          })
        : parModele

    /* Tracé AVANT de répondre, et aussi en cas d'échec : sans la ligne d'échec, l'admin verrait
       un historique vide et conclurait qu'il n'a jamais relancé, alors que l'envoi a bien été
       tenté — c'est précisément ce qu'il a besoin de savoir pour décider d'appeler. */
    await serviceClient.from('relances').insert({
      etablissement_id: etablissementId,
      prospect_id: contexte.prospectId,
      motif,
      destinataire_email: contexte.email,
      modele_reference: parModele.envoye ? reference : null,
      succes: resultat.envoye,
      erreur: resultat.envoye ? null : (resultat.erreur ?? 'Envoi refusé.'),
      envoyee_par: profileId,
    })

    if (!resultat.envoye) {
      return Response.json(
        { error: resultat.erreur ?? "L'e-mail n'a pas pu être envoyé. Vérifiez la configuration Resend." },
        { status: 502 },
      )
    }

    return Response.json({ ok: true })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
