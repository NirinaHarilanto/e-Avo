import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  packageId?: string
  decision?: 'poursuivi' | 'arrete'
}

/**
 * Décision prise après l'heure d'essai (0057) — demande client du 2026-09-21.
 *
 * « Poursuivre » crée un SECOND forfait pour les heures restantes du forfait visé, au prix de ce
 * forfait moins ce qui a déjà été facturé pour l'essai. Au total, l'élève aura donc payé
 * exactement le prix du forfait qu'il avait choisi. « Arrêter » ne facture rien de plus : il
 * n'aura payé que son heure.
 *
 * Deux forfaits successifs plutôt qu'un forfait qu'on agrandirait après coup : une facture émise
 * est figée dans ce schéma (voir le reçu automatique, 0030), on ne doit jamais avoir à réécrire
 * une facture d'une heure en facture de forfait complet.
 *
 * Côté serveur et non depuis le navigateur : le montant du complément est une soustraction que
 * deux admins simultanés ne doivent pas pouvoir calculer différemment, et le forfait d'essai doit
 * être verrouillé (décision déjà prise) dans le même geste que la création du complément.
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
      return Response.json({ error: "Ce forfait n'est pas une heure d'essai." }, { status: 400 })
    }
    if (essai.essai_resultat) {
      // Idempotence : deux clics, ou deux admins, ne doivent pas créer deux compléments.
      return Response.json({ error: 'La décision a déjà été enregistrée pour cet essai.' }, { status: 409 })
    }

    let complementId: string | null = null

    if (corps.decision === 'poursuivi') {
      if (!essai.tarif_vise_id) {
        return Response.json(
          { error: "Aucun forfait visé n'est enregistré sur cet essai : impossible de chiffrer le complément." },
          { status: 400 },
        )
      }
      const { data: tarifVise } = await serviceClient
        .from('tarifs')
        .select('heures, prix, titre')
        .eq('id', essai.tarif_vise_id)
        .maybeSingle()

      if (!tarifVise || tarifVise.heures == null) {
        return Response.json(
          { error: "Le forfait visé n'a pas de volume d'heures fixe : créez le forfait complémentaire à la main." },
          { status: 400 },
        )
      }

      const heuresRestantes = tarifVise.heures - essai.total_heures
      if (heuresRestantes <= 0) {
        return Response.json(
          { error: "Le forfait visé ne dépasse pas l'heure d'essai : il n'y a pas de complément à créer." },
          { status: 400 },
        )
      }

      /* Plancher à zéro : si le tarif horaire dépasse le prix du forfait visé (forfait très
         court, ou grille tarifaire incohérente), l'élève a déjà trop payé — on ne produit
         surtout pas un montant négatif, qui casserait le calcul du reste dû et le reçu. */
      const complement = Math.max(0, Number(tarifVise.prix) - Number(essai.montant ?? 0))

      const { data: cree, error: erreurComplement } = await serviceClient
        .from('packages')
        .insert({
          etablissement_id: etablissementId,
          student_id: essai.student_id,
          type_programme: essai.type_programme,
          total_heures: heuresRestantes,
          montant: complement,
        })
        .select('id')
        .single()

      if (erreurComplement || !cree) {
        return Response.json({ error: erreurComplement?.message ?? 'Le forfait complémentaire n’a pas pu être créé.' }, { status: 500 })
      }
      complementId = cree.id
    }

    const { error: erreurDecision } = await serviceClient
      .from('packages')
      .update({ essai_resultat: corps.decision, essai_decide_le: new Date().toISOString() })
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
