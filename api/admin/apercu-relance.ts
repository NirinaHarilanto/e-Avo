import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { composerDepuisModele } from '../_lib/templatesEmail.js'
import { contexteRelanceEtudiant, contexteRelanceProspect, motifProspect } from '../_lib/relance.js'

export const config = { runtime: 'edge' }

interface Corps {
  prospectId?: string
  studentId?: string
  motif?: string
}

/**
 * Le message d'une relance tel qu'il partirait, SANS l'envoyer — demande client du 2026-11-21 :
 * « quand on clique sur le bouton Relancer le prospect, est-ce que l'on peut un deuxième pop-up
 * sur lequel se trouve le mail à envoyer au prospect et éventuellement possibilité de modifier le
 * contenu du mail avant de valider et envoyer ».
 *
 * Rien n'est écrit ici : ni envoi, ni trace dans `relances`. Consulter un message ne doit pas
 * laisser croire qu'on l'a envoyé — c'est le bouton de la fenêtre qui décide, et lui seul.
 *
 * Le texte vient de `composerDepuisModele`, celui-là même qu'utilise l'envoi : afficher un
 * message et en expédier un autre serait pire que de n'en afficher aucun.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    let contexte: { email: string; reference: string; valeurs: Record<string, string | undefined> } | null = null
    if (corps.prospectId) {
      contexte = await contexteRelanceProspect(serviceClient, etablissementId, corps.prospectId, motifProspect(corps.motif))
      if (!contexte) return Response.json({ error: 'Prospect introuvable pour cet établissement.' }, { status: 404 })
    } else if (corps.studentId) {
      const { contexte: trouve, erreur } = await contexteRelanceEtudiant(serviceClient, etablissementId, corps.studentId)
      if (erreur) return Response.json({ error: erreur }, { status: 400 })
      if (!trouve) return Response.json({ error: 'Étudiant introuvable pour cet établissement.' }, { status: 404 })
      contexte = trouve
    } else {
      return Response.json({ error: 'prospectId ou studentId est requis.' }, { status: 400 })
    }

    const compose = await composerDepuisModele(serviceClient, {
      etablissementId,
      reference: contexte.reference,
      valeurs: contexte.valeurs,
    })
    if (!compose.ok) {
      return Response.json({ error: compose.erreur }, { status: 404 })
    }

    /* Les variables restées sans valeur, nommées comme l'administration les connaît. Afficher
       `lien_google_form` lui demanderait de traduire un identifiant de code ; son écran de
       réglages, lui, dit « Lien du formulaire du test écrit ». La clé technique reste le repli,
       pour une variable qui n'aurait pas de libellé. */
    let manquantes = compose.manquantes
    if (manquantes.length > 0) {
      const { data: connues } = await serviceClient
        .from('email_variables')
        .select('cle, libelle')
        .eq('etablissement_id', etablissementId)
        .in('cle', manquantes)
      const libelleDe = new Map((connues ?? []).map((v) => [v.cle, v.libelle]))
      manquantes = manquantes.map((cle) => libelleDe.get(cle) ?? cle)
    }

    return Response.json({
      destinataire: contexte.email,
      reference: contexte.reference,
      objet: compose.objet,
      corps: compose.corps,
      /* Vu AVANT l'envoi : l'administration peut compléter la phrase à la main, plutôt que de
         découvrir un trou dans le message reçu. */
      manquantes,
    })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
