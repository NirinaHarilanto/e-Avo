import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  prestationId?: string
  compteRendu?: string
}

/**
 * Compte rendu d'une prestation externe (corporate, chat & chill) — demande client du
 * 2026-10-20 : « le professeur concerné devrait renseigner un compte rendu au moment de la
 * clôture de la séance [...] visible par le professeur [...] et par l'admin ».
 *
 * Passe par le serveur plutôt que par une policy d'écriture cliente : le professeur n'a
 * aujourd'hui qu'un accès en LECTURE sur ses propres prestations (`prestations_externes_teacher_
 * select`, 0131) — ouvrir une policy d'update laisserait aussi réécrire `client`, `debut` ou
 * `statut` depuis le navigateur, des champs que `peutEtreModifiee` réserve à l'admin. Même
 * raisonnement que la clôture elle-même (api/prestations/cloturer.ts), qui passe déjà par ici.
 *
 * Écriture réservée au professeur CONCERNÉ (jamais l'admin, même s'il peut déjà tout lire) : « le
 * professeur concerné devrait renseigner », l'admin n'est cité que pour la visibilité. Et jamais
 * avant la clôture : une prestation encore planifiée n'a rien eu lieu à rendre compte.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireTeacherOrAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.prestationId) {
      return Response.json({ error: 'prestationId est requis.' }, { status: 400 })
    }
    const compteRendu = corps.compteRendu?.trim() ?? ''
    if (!compteRendu) {
      return Response.json({ error: 'Le compte rendu ne peut pas être vide.' }, { status: 400 })
    }

    const { data: prestation } = await serviceClient
      .from('prestations_externes')
      .select('id, etablissement_id, teacher_id, statut')
      .eq('id', corps.prestationId)
      .maybeSingle()

    if (!prestation || prestation.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Prestation introuvable.' }, { status: 404 })
    }
    if (prestation.teacher_id !== profileId) {
      return Response.json({ error: 'Vous ne pouvez renseigner le compte rendu que de vos propres prestations.' }, { status: 403 })
    }
    if (prestation.statut !== 'terminee') {
      return Response.json({ error: 'Le compte rendu ne peut être renseigné qu’une fois la prestation clôturée.' }, { status: 409 })
    }

    const { error } = await serviceClient
      .from('prestations_externes')
      .update({ compte_rendu: compteRendu, compte_rendu_le: new Date().toISOString() })
      .eq('id', prestation.id)
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (erreur) {
    if (erreur instanceof TeacherAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
