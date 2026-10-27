import { jourDansFuseauEtablissement } from '../../src/lib/etablissement.js'
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
  /* Paiement enregistré dans le même geste (demande client du 2026-10-11, même principe que
     l'ajout de forfait, 0061/api/admin/ajouter-forfait.ts) : « poursuivi » et « prolonge »
     engagent toujours une dépense, le paiement doit être confirmé AVANT que la décision ne soit
     appliquée. Absent pour 'arrete', qui ne facture jamais rien de plus. */
  montantPaiement?: number
  motifPaiement?: string
  moyenPaiement?: string
  referencePaiement?: string
}

/**
 * Décision prise après la séance d'essai (0057, revue le 2026-09-29, prolongation et paiement
 * obligatoire le 2026-10-11).
 *
 * L'essai (1 à 3 h au tarif horaire) est facturé À PART : « poursuivre » crée le forfait COMPLET
 * choisi à ce moment-là (celui retenu au départ ou un autre), sans rien en déduire. « Arrêter »
 * ne facture rien de plus. « Prolonger » ajoute X heures d'essai au même tarif horaire sous la
 * forme d'un NOUVEAU forfait d'essai (0115) : chaque tranche porte ses propres heures, son propre
 * montant et son propre paiement, et la précédente est close par `essai_resultat = 'prolonge'`.
 * Allonger le forfait existant, comme c'était fait au premier jet, revenait à réécrire un forfait
 * déjà payé — le paiement de la première tranche se retrouvait affiché sous le volume cumulé,
 * en contradiction avec son propre reçu. La décision finale se prend toujours sur la DERNIÈRE
 * tranche ; les heures d'essai se lisent, elles, en cumulant les forfaits (voir
 * `totalHeuresCumulees`), comme partout ailleurs dans l'application.
 *
 * « Poursuivi » et « prolonge » exigent désormais un paiement, créé dans LE MÊME appel, déjà
 * réglé (`statut: 'paye'`) — même principe que l'ajout de forfait (0061, ajouter-forfait.ts) :
 * aucune de ces deux décisions ne doit pouvoir s'appliquer sans qu'on sache si elle a été payée.
 *
 * Côté serveur : le forfait d'essai doit être verrouillé (décision déjà prise) dans le même geste
 * que la création du forfait de suite, pour que deux clics n'en créent pas deux.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    if (!corps.packageId || (corps.decision !== 'poursuivi' && corps.decision !== 'arrete' && corps.decision !== 'prolonge')) {
      return Response.json({ error: 'Forfait et décision sont obligatoires.' }, { status: 400 })
    }
    // Même garde-fou que l'ajout de forfait (0061, api/admin/ajouter-forfait.ts) : « poursuivi »
    // et « prolonge » engagent toujours une dépense, revérifié ici même si le formulaire bloque
    // déjà la validation côté écran tant que le paiement n'est pas confirmé.
    if (corps.decision === 'poursuivi' || corps.decision === 'prolonge') {
      if (!corps.montantPaiement || corps.montantPaiement <= 0) {
        return Response.json({ error: 'Le paiement doit être enregistré avant de valider la décision.' }, { status: 400 })
      }
      if (!corps.motifPaiement || !corps.motifPaiement.trim()) {
        return Response.json({ error: 'Un motif est obligatoire pour enregistrer le paiement.' }, { status: 400 })
      }
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

      /* Un NOUVEAU forfait d'essai, portant les seules heures ajoutées et leur seul montant —
         jamais un allongement du précédent (0115). Allonger revenait à réécrire après coup un
         forfait déjà payé : le paiement de la première tranche s'affichait alors sous le volume
         cumulé (« 3 h » pour 35 000 Ar), en contradiction avec son propre reçu, figé lui sur
         « 1 h ». Défaut constaté en production et signalé par le client le 2026-10-11, qui
         demande « deux lignes de paiements distincts pour chaque forfait pris ». C'est aussi le
         modèle posé par 0057 : des forfaits successifs, jamais un total qu'on réécrit.
         `tarif_vise_id` est repris pour que l'écran de décision continue de proposer le forfait
         retenu au départ. */
      const { data: tranche, error: erreurTranche } = await serviceClient
        .from('packages')
        .insert({
          etablissement_id: etablissementId,
          student_id: essai.student_id,
          type_programme: essai.type_programme,
          total_heures: heures,
          montant: montantAjoute,
          essai: true,
          tarif_vise_id: essai.tarif_vise_id,
        })
        .select('id')
        .single()
      if (erreurTranche || !tranche) {
        return Response.json({ error: erreurTranche?.message ?? 'La prolongation n’a pas pu être créée.' }, { status: 500 })
      }

      const { error: erreurPaiement } = await serviceClient.from('student_payments').insert({
        etablissement_id: etablissementId,
        student_id: essai.student_id,
        package_id: tranche.id,
        montant: corps.montantPaiement!,
        montant_regle: corps.montantPaiement!,
        statut: 'paye',
        date_paiement: jourDansFuseauEtablissement(),
        moyen_paiement: corps.moyenPaiement?.trim() || null,
        reference: corps.referencePaiement?.trim() || null,
        notes: corps.motifPaiement!.trim(),
        created_by_profile_id: profileId,
      })
      if (erreurPaiement) {
        // La tranche est déjà en base à ce stade : mieux vaut le signaler explicitement que de la
        // défaire en silence et faire perdre à l'admin la trace de ce qu'il vient de faire (même
        // choix que api/admin/ajouter-forfait.ts).
        return Response.json(
          { error: `Les heures ont été ajoutées, mais l’enregistrement du paiement a échoué : ${erreurPaiement.message}` },
          { status: 500 },
        )
      }

      /* La tranche précédente est close : sans cela, deux forfaits d'essai resteraient
         simultanément « en attente de décision » et le dossier afficherait « Essai » sans suite
         pour le premier. La décision finale se prendra sur la nouvelle tranche, la plus récente. */
      const { error: erreurCloture } = await serviceClient
        .from('packages')
        .update({ essai_resultat: 'prolonge', essai_decide_le: new Date().toISOString() })
        .eq('id', essai.id)
      if (erreurCloture) {
        return Response.json({ error: erreurCloture.message }, { status: 500 })
      }

      return Response.json({ ok: true, decision: 'prolonge', heuresAjoutees: heures, montantAjoute, packageId: tranche.id })
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

      const { error: erreurPaiement } = await serviceClient.from('student_payments').insert({
        etablissement_id: etablissementId,
        student_id: essai.student_id,
        package_id: cree.id,
        montant: corps.montantPaiement!,
        montant_regle: corps.montantPaiement!,
        statut: 'paye',
        date_paiement: jourDansFuseauEtablissement(),
        moyen_paiement: corps.moyenPaiement?.trim() || null,
        reference: corps.referencePaiement?.trim() || null,
        notes: corps.motifPaiement!.trim(),
        created_by_profile_id: profileId,
      })
      if (erreurPaiement) {
        // Le forfait existe déjà à ce stade : mieux vaut le signaler à l'admin (même choix que
        // api/admin/ajouter-forfait.ts) que de le supprimer en silence.
        return Response.json(
          { error: `Forfait créé, mais l’enregistrement du paiement a échoué : ${erreurPaiement.message}` },
          { status: 500 },
        )
      }
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
