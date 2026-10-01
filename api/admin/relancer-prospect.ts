import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { envoyerEmail, modeleRelanceProspect } from '../_lib/email.js'
import { dateLisible, envoyerDepuisModele } from '../_lib/templatesEmail.js'

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

    /* Texte repris du modèle « 1.2 Relance » (0091, document client du 23 septembre 2026), bien
       plus complet que le gabarit de code d'origine : il donne les deux chemins (diagnostic call
       pour l'individuel/duo, test écrit puis test oral pour le collectif) au lieu d'un simple
       rappel. L'admin peut le corriger depuis son écran Template e-mails, et cette relance suit.
       La prochaine vague à venir alimente les variables de la partie collectif ; si aucune n'est
       programmée, les lignes concernées tombent d'elles-mêmes (voir preparerEmail). */
    const { data: prochaineVague } = await serviceClient
      .from('cohorts')
      .select('nom, date_debut, date_fin')
      .eq('etablissement_id', etablissementId)
      .gte('date_fin', new Date().toISOString().slice(0, 10))
      .order('date_debut')
      .limit(1)
      .maybeSingle()

    const parModele = await envoyerDepuisModele(serviceClient, {
      etablissementId,
      reference: '1.2',
      destinataires: [prospect.email],
      valeurs: {
        prenom: prospect.prenom,
        numero_vague: prochaineVague?.nom,
        date_debut_vague: dateLisible(prochaineVague?.date_debut),
        date_fin_vague: dateLisible(prochaineVague?.date_fin),
      },
    })

    /* Repli sur le gabarit de code si le modèle a été supprimé ou désactivé : la relance est une
       action que l'admin vient de déclencher d'un clic, elle ne doit pas rester sans effet. */
    const { envoye, erreur } = parModele.envoye
      ? parModele
      : await envoyerEmail({
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
