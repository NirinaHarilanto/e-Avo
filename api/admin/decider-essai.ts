import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  packageId?: string
  decision?: 'poursuivi' | 'arrete' | 'prolonge'
  /* Forfait de suite choisi à la décision — peut différer du forfait visé au départ. */
  tarifId?: string
  /* Heures d'essai supplémentaires demandées (decision 'prolonge' uniquement) — demande client
     du 2026-10-11 : « 1h, 2h ou 3h, voir plus », facturées au même tarif horaire que l'essai
     initial. */
  heuresSupplementaires?: number
}

/**
 * Décision prise après la séance d'essai (0057, revue le 2026-09-29, prolongation le 2026-10-11).
 *
 * L'essai (1 à 3 h au tarif horaire) est facturé À PART : « poursuivre » crée le forfait COMPLET
 * choisi à ce moment-là (celui retenu au départ ou un autre), sans rien en déduire. « Arrêter »
 * ne facture rien de plus. « Prolonger » allonge l'essai EN COURS de X heures supplémentaires, au
 * même tarif horaire — contrairement aux deux autres décisions, elle ne verrouille pas
 * `essai_resultat` : l'essai reste en attente d'une décision finale, juste plus long. Le forfait
 * d'essai lui-même est étendu (total_heures/montant augmentés) plutôt que dupliqué en un second
 * forfait : aucun reçu n'est émis à la création d'un forfait (seulement au paiement, voir 0030),
 * donc rien ne fige le montant initial avant que l'admin n'encaisse — étendre ce même forfait
 * laisse simplement un solde plus grand à régler, sans perturber les totaux cumulés du dossier
 * (sum(total_heures) across packages, lus ailleurs dans l'application) qu'un second forfait
 * essai aurait faussés.
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

    if (!corps.packageId || (corps.decision !== 'poursuivi' && corps.decision !== 'arrete' && corps.decision !== 'prolonge')) {
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

    if (corps.decision === 'prolonge') {
      const heures = corps.heuresSupplementaires
      if (!heures || !Number.isFinite(heures) || heures <= 0) {
        return Response.json({ error: 'Indiquez un nombre d’heures supplémentaires valide.' }, { status: 400 })
      }
      // Même tarif horaire que l'essai initial (voir PipelineCRM.tsx : le tarif à 1 h du même
      // programme) — sans lui, impossible de chiffrer la prolongation.
      const { data: tarifHoraire } = await serviceClient
        .from('tarifs')
        .select('prix')
        .eq('etablissement_id', etablissementId)
        .eq('type_programme', essai.type_programme)
        .eq('heures', 1)
        .maybeSingle()
      if (!tarifHoraire) {
        return Response.json(
          { error: "Aucun tarif horaire n'est configuré pour ce programme : la prolongation ne peut pas être chiffrée." },
          { status: 400 },
        )
      }
      const montantAjoute = heures * Number(tarifHoraire.prix)
      const { error: erreurProlongation } = await serviceClient
        .from('packages')
        .update({ total_heures: essai.total_heures + heures, montant: Number(essai.montant ?? 0) + montantAjoute })
        .eq('id', essai.id)
      if (erreurProlongation) {
        return Response.json({ error: erreurProlongation.message }, { status: 500 })
      }
      return Response.json({ ok: true, decision: 'prolonge', heuresAjoutees: heures, montantAjoute })
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
