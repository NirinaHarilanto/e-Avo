import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  studentId?: string
  heures?: number
  typeProgramme?: 'individuel' | 'duo'
  echeance?: string
  // Paiement enregistré dans le même geste (0061) — demande client du 2026-09-22 : la
  // validation finale de l'ajout de forfait ne doit être possible qu'après confirmation du
  // paiement, avec un motif systématique.
  montantPaiement?: number
  motifPaiement?: string
  moyenPaiement?: string
  referencePaiement?: string
  // Présent si cet ajout valide une demande de l'élève (0061).
  demandeId?: string
}

/**
 * Ajout d'un forfait à un élève qui en a déjà un — demande client du 2026-09-22 : « le nombre
 * d'heures serait alors cumulé ». Un nouveau forfait plutôt qu'une correction du total du
 * précédent (même principe que l'heure d'essai, 0057) : `packages` reste un historique de
 * souscriptions successives (voir `HistoriqueForfaits`), jamais un total qu'on réécrit.
 *
 * Le paiement est créé ICI, dans le même appel, déjà réglé (`statut: 'paye'`) : la demande
 * client encadre cet ajout d'un contrôle de paiement précisément pour qu'aucun forfait ne soit
 * jamais rajouté sans qu'on sache s'il a été payé. Le motif est obligatoire côté client
 * (formulaire) et revérifié ici.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    if (!corps.studentId || !corps.heures || corps.heures <= 0) {
      return Response.json({ error: 'Étudiant et nombre d’heures sont obligatoires.' }, { status: 400 })
    }
    if (!corps.montantPaiement || corps.montantPaiement <= 0) {
      return Response.json({ error: 'Le paiement doit être enregistré avant de valider l’ajout de forfait.' }, { status: 400 })
    }
    if (!corps.motifPaiement || !corps.motifPaiement.trim()) {
      return Response.json({ error: 'Un motif est obligatoire pour enregistrer le paiement.' }, { status: 400 })
    }

    const { data: eleve } = await serviceClient
      .from('profiles')
      .select('id, etablissement_id')
      .eq('id', corps.studentId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()
    if (!eleve) {
      return Response.json({ error: 'Étudiant introuvable pour cet établissement.' }, { status: 404 })
    }

    let demande: { id: string; statut: string } | null = null
    if (corps.demandeId) {
      const { data } = await serviceClient
        .from('demandes_forfait')
        .select('id, statut')
        .eq('id', corps.demandeId)
        .eq('student_id', corps.studentId)
        .maybeSingle()
      if (!data) {
        return Response.json({ error: 'Demande introuvable.' }, { status: 404 })
      }
      if (data.statut !== 'en_attente') {
        return Response.json({ error: 'Cette demande a déjà été traitée.' }, { status: 409 })
      }
      demande = data
    }

    // Type de programme repris du dernier forfait de l'élève (un ajout prolonge un parcours déjà
    // engagé, il n'a pas de raison d'en changer la nature) — individuel par défaut si l'élève
    // n'en a encore aucun.
    let typeProgramme = corps.typeProgramme
    if (!typeProgramme) {
      const { data: dernier } = await serviceClient
        .from('packages')
        .select('type_programme')
        .eq('student_id', corps.studentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      typeProgramme = (dernier?.type_programme as 'individuel' | 'duo') ?? 'individuel'
    }

    const { data: forfait, error: erreurForfait } = await serviceClient
      .from('packages')
      .insert({
        etablissement_id: etablissementId,
        student_id: corps.studentId,
        type_programme: typeProgramme,
        total_heures: corps.heures,
        montant: corps.montantPaiement,
        echeance: corps.echeance || null,
      })
      .select('id')
      .single()
    if (erreurForfait || !forfait) {
      return Response.json({ error: erreurForfait?.message ?? 'Le forfait n’a pas pu être créé.' }, { status: 500 })
    }

    const { error: erreurPaiement } = await serviceClient.from('student_payments').insert({
      etablissement_id: etablissementId,
      student_id: corps.studentId,
      package_id: forfait.id,
      montant: corps.montantPaiement,
      montant_regle: corps.montantPaiement,
      statut: 'paye',
      date_paiement: new Date().toISOString().slice(0, 10),
      moyen_paiement: corps.moyenPaiement?.trim() || null,
      reference: corps.referencePaiement?.trim() || null,
      notes: corps.motifPaiement.trim(),
      created_by_profile_id: profileId,
    })
    if (erreurPaiement) {
      // Le forfait existe déjà à ce stade : mieux vaut le signaler à l'admin (message explicite)
      // que de le supprimer en silence et lui faire perdre la trace de ce qu'il vient de créer.
      return Response.json(
        { error: `Forfait créé, mais l’enregistrement du paiement a échoué : ${erreurPaiement.message}` },
        { status: 500 },
      )
    }

    if (demande) {
      await serviceClient
        .from('demandes_forfait')
        .update({
          statut: 'validee',
          package_id: forfait.id,
          decidee_le: new Date().toISOString(),
          decidee_par_profile_id: profileId,
        })
        .eq('id', demande.id)
    }

    return Response.json({ ok: true, packageId: forfait.id })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
