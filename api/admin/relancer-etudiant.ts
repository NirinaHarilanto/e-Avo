import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerNotification } from '../_lib/notifications.js'
import { envoyerDepuisModele } from '../_lib/templatesEmail.js'

export const config = { runtime: 'edge' }

interface Corps {
  studentId?: string
}

/**
 * Relance d'un étudiant dont le parcours est en pause — demande client du 2026-10-19 (point 7) :
 * à la mise en pause, l'admin note une date de relance ; arrivé le jour dit, ce bouton envoie le
 * message de reprise et l'inscrit dans l'historique des relances du dossier.
 *
 * Distinct de `relancer-prospect.ts` : la cible est un compte existant (donc une notification
 * interne s'ajoute à l'e-mail, ce qu'un prospect ne peut pas recevoir), et le modèle est le
 * « 4.7 Reprise après une pause » (0130).
 *
 * Volontairement ouvert à un étudiant actif comme à un étudiant en pause : un élève dont le
 * forfait est épuisé est lui aussi « inactif » au sens de la demande 7, et c'est exactement
 * quelqu'un qu'on veut pouvoir rappeler.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId, profileId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.studentId) {
      return Response.json({ error: 'studentId est requis.' }, { status: 400 })
    }

    const { data: eleve } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id, prenom, email, status')
      .eq('id', corps.studentId)
      .maybeSingle()
    if (!eleve || eleve.etablissement_id !== etablissementId || eleve.role !== 'etudiant') {
      return Response.json({ error: 'Étudiant introuvable pour cet établissement.' }, { status: 404 })
    }
    if (!eleve.email) {
      return Response.json({ error: "Cet étudiant n'a pas d'adresse e-mail enregistrée." }, { status: 400 })
    }

    const resultat = await envoyerDepuisModele(serviceClient, {
      etablissementId,
      reference: '4.7',
      destinataires: [eleve.email],
      valeurs: { prenom: eleve.prenom },
    })

    await serviceClient.from('relances').insert({
      etablissement_id: etablissementId,
      student_id: eleve.id,
      motif: 'reprise_apres_pause',
      destinataire_email: eleve.email,
      modele_reference: resultat.envoye ? '4.7' : null,
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

    /* L'élève garde l'accès à son espace pendant sa pause (voir api/admin/pause-etudiant.ts) : la
       notification l'y attend, en plus de l'e-mail. Sans elle, un élève qui se reconnecte sans
       avoir lu son courrier ne verrait rien. */
    await creerNotification(serviceClient, {
      etablissementId,
      destinataireProfileId: eleve.id,
      type: 'relance_reprise',
      titre: 'Reprise de vos cours',
      message: 'Hari Online Club vous invite à reprendre votre parcours. Répondez à l’e-mail reçu ou écrivez à l’administration.',
      lien: '/mon-espace',
    })

    return Response.json({ ok: true })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
