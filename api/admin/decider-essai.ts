import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  packageId?: string
  decision?: 'poursuivi' | 'arrete'
  /* Forfait de suite choisi à la décision — peut différer du forfait visé au départ. */
  tarifId?: string
}

/**
 * Décision prise après la séance d'essai (0057, revue le 2026-09-29).
 *
 * L'essai (1 à 3 h au tarif horaire) est facturé À PART : « poursuivre » crée le forfait COMPLET
 * choisi à ce moment-là (celui retenu au départ ou un autre), sans rien en déduire. « Arrêter »
 * ne facture rien de plus.
 *
 * Côté serveur : le forfait d'essai doit être verrouillé (décision déjà prise) dans le même geste
 * que la création du forfait de suite, pour que deux clics n'en créent pas deux.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    if (!corps.packageId || (corps.decision !== 'poursuivi' && corps.decision !== 'arrete')) {
      return Response.json({ error: 'Forfait et décision sont obligatoires.' }, { status: 400 })
    }

    const { data: essai } = await serviceClient
      .from('packages')
      .select('*')
      .eq('id', corps.packageId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()

    if (!essai) {
      return Response.json({ error: 'Forfait introuvable pour cet établissement.' }, { status: 404 })
    }
    if (!essai.essai) {
      return Response.json({ error: "Ce forfait n'est pas une séance d'essai." }, { status: 400 })
    }
    if (essai.essai_resultat) {
      return Response.json({ error: 'La décision a déjà été enregistrée pour cet essai.' }, { status: 409 })
    }

    let complementId: string | null = null

    if (corps.decision === 'poursuivi') {
      const tarifId = corps.tarifId ?? essai.tarif_vise_id
      if (!tarifId) {
        return Response.json({ error: 'Choisissez le forfait avec lequel l’élève poursuit.' }, { status: 400 })
      }
      const { data: tarif } = await serviceClient
        .from('tarifs')
        .select('heures, prix, titre, etablissement_id')
        .eq('id', tarifId)
        .maybeSingle()

      if (!tarif || tarif.etablissement_id !== etablissementId) {
        return Response.json({ error: 'Forfait introuvable pour cet établissement.' }, { status: 404 })
      }
      if (tarif.heures == null) {
        return Response.json(
          { error: "Ce forfait n'a pas de volume d'heures fixe : créez-le à la main depuis le dossier." },
          { status: 400 },
        )
      }

      const { data: cree, error: erreurComplement } = await serviceClient
        .from('packages')
        .insert({
          etablissement_id: etablissementId,
          student_id: essai.student_id,
          type_programme: essai.type_programme,
          total_heures: tarif.heures,
          montant: tarif.prix,
        })
        .select('id')
        .single()

      if (erreurComplement || !cree) {
        return Response.json({ error: erreurComplement?.message ?? 'Le forfait n’a pas pu être créé.' }, { status: 500 })
      }
      complementId = cree.id
    }

    const { error: erreurDecision } = await serviceClient
      .from('packages')
      .update({ essai_resultat: corps.decision, essai_decide_le: new Date().toISOString(), ...(corps.decision === 'poursuivi' && corps.tarifId ? { tarif_vise_id: corps.tarifId } : {}) })
      .eq('id', essai.id)

    if (erreurDecision) {
      return Response.json({ error: erreurDecision.message }, { status: 500 })
    }

    return Response.json({ ok: true, decision: corps.decision, complementId })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
