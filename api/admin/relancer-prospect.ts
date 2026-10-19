import { nomVagueSeul } from '../../src/lib/cohortes.js'
import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { envoyerEmail, modeleRelanceProspect } from '../_lib/email.js'
import { dateLisible, envoyerDepuisModele } from '../_lib/templatesEmail.js'

export const config = { runtime: 'edge' }

/* Deux relances possibles sur un prospect, depuis le 2026-10-19 :
   - `forfait_a_choisir` : la relance d'origine (2026-09-21), pour un prospect en « Diagnostic
     réalisé » qui n'a pas encore tranché son forfait ni son rythme (modèle 1.2) ;
   - `absence_diagnostic` : demande client 4, « si le prospect n'est pas présent lors du diagnostic
     call, on doit pouvoir le relancer via un bouton et un mail automatique » (modèle 1.3, ajouté
     par la migration 0130).
   Un seul endpoint : l'authentification, la vérification d'appartenance à l'établissement et la
   trace dans `relances` sont identiques, seul le modèle d'e-mail diffère. */
type MotifProspect = 'forfait_a_choisir' | 'absence_diagnostic' | 'paiement_a_regler'

interface Corps {
  prospectId?: string
  motif?: MotifProspect
}

const REFERENCE_MODELE: Record<MotifProspect, string> = {
  forfait_a_choisir: '1.2',
  absence_diagnostic: '1.3',
  /* Ajouté le 2026-10-19 (migration 0133) : le prospect a passé son diagnostic ET choisi sa
     formule, il ne manque que le règlement pour qu'il devienne étudiant. Le modèle 1.2 ne
     convenait plus à ce stade — il explique les chemins possibles à quelqu'un qui n'a encore
     rien tranché, alors qu'ici tout l'est. Demande client : « féliciter la personne d'être
     arrivée à ce stade et l'inviter à payer les frais de cours pour commencer son parcours ». */
  paiement_a_regler: '1.4',
}

const MOTIFS: MotifProspect[] = ['forfait_a_choisir', 'absence_diagnostic', 'paiement_a_regler']

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
    /* Motif par défaut à la relance d'origine : l'ancien appel du pipeline n'en envoyait aucun,
       et c'est bien ce cas-là qu'il visait. */
    const motif: MotifProspect = MOTIFS.includes(corps.motif as MotifProspect) ? (corps.motif as MotifProspect) : 'forfait_a_choisir'

    const { data: prospect } = await serviceClient
      .from('prospects')
      .select('id, etablissement_id, prenom, email, statut, type_programme, tarif_choisi_id')
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

    /* Formule retenue et somme attendue, pour la relance de règlement (1.4) : le message doit
       rappeler précisément ce que la personne a choisi, sinon « réglez vos frais » ne lui dit pas
       de quoi il s'agit. Une ligne dont la variable reste vide disparaît d'elle-même du modèle
       (voir preparerEmail), donc un prospect sans tarif choisi reçoit le même message sans ces
       deux lignes plutôt qu'un texte à trous. */
    const { data: tarifChoisi } = prospect.tarif_choisi_id
      ? await serviceClient.from('tarifs').select('titre, prix, unite, heures').eq('id', prospect.tarif_choisi_id).maybeSingle()
      : { data: null }

    const formuleChoisie = tarifChoisi
      ? `${tarifChoisi.titre}${tarifChoisi.heures ? ` — ${tarifChoisi.heures} h` : ''}`
      : undefined
    const montantARegler = tarifChoisi?.prix ? `${Number(tarifChoisi.prix).toLocaleString('fr-FR')} ${tarifChoisi.unite || 'Ar'}` : undefined

    const reference = REFERENCE_MODELE[motif]
    const parModele = await envoyerDepuisModele(serviceClient, {
      etablissementId,
      reference,
      destinataires: [prospect.email],
      valeurs: {
        prenom: prospect.prenom,
        /* Les modèles écrivent déjà le mot autour de la variable (« la vague {{numero_vague}}
           démarre le… », migration 0091) : y injecter « Vague Novembre » tel qu'il est nommé en
           base donnerait « la vague Vague Novembre démarre ». */
        numero_vague: nomVagueSeul(prochaineVague?.nom) || undefined,
        date_debut_vague: dateLisible(prochaineVague?.date_debut),
        date_fin_vague: dateLisible(prochaineVague?.date_fin),
        formule_choisie: formuleChoisie,
        montant_a_regler: montantARegler,
      },
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
            destinataire: prospect.email,
            sujet: `On vous attend chez ${etablissement?.nom ?? 'Hari Online Club'} !`,
            html: modeleRelanceProspect({ prenom: prospect.prenom, etablissement: etablissement?.nom ?? 'Hari Online Club' }),
          })
        : parModele

    /* Tracé AVANT de répondre, et aussi en cas d'échec : sans la ligne d'échec, l'admin verrait
       un historique vide et conclurait qu'il n'a jamais relancé, alors que l'envoi a bien été
       tenté — c'est précisément ce qu'il a besoin de savoir pour décider d'appeler. */
    await serviceClient.from('relances').insert({
      etablissement_id: etablissementId,
      prospect_id: prospect.id,
      motif,
      destinataire_email: prospect.email,
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
