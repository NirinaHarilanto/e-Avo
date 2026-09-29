import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerNotification } from '../_lib/notifications.js'
import { numeroSuivant } from '../_lib/numerotation.js'

export const config = { runtime: 'edge' }

interface Corps {
  table?: 'student_payments' | 'teacher_payments'
  id?: string
  /* 'recu' (élève seulement) : reçu de ce qui a été encaissé depuis le dernier reçu (0080). */
  type?: 'facture' | 'recu'
}

/**
 * Facture émise depuis une ligne de paiement — demande client du 2026-09-21 (point 4). Côté
 * étudiant c'est une facture de forfait, côté professeur une facture de rémunération : même
 * document, même table `invoices`, seul le destinataire change.
 *
 * Passe par le serveur plutôt que par un insert client bien que `invoices_admin_insert` (0020)
 * l'autoriserait : la numérotation doit rester unique par établissement (contrainte
 * `unique (etablissement_id, numero)`), et deux admins qui cliquent en même temps depuis leur
 * navigateur calculeraient le même numéro. Le service_role permet aussi de vérifier qu'aucune
 * facture n'existe déjà pour ce paiement, y compris un reçu créé automatiquement par le
 * trigger de la migration 0030.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    if (!corps.id || (corps.table !== 'student_payments' && corps.table !== 'teacher_payments')) {
      return Response.json({ error: 'Paiement invalide.' }, { status: 400 })
    }
    const estProfesseur = corps.table === 'teacher_payments'

    const { data: paiement } = estProfesseur
      ? await serviceClient.from('teacher_payments').select('*').eq('id', corps.id).maybeSingle()
      : await serviceClient.from('student_payments').select('*').eq('id', corps.id).maybeSingle()

    if (!paiement || paiement.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Paiement introuvable pour cet établissement.' }, { status: 404 })
    }
    if (paiement.supprime_le) {
      return Response.json({ error: 'Ce paiement a été supprimé.' }, { status: 400 })
    }

    if (corps.type === 'recu') {
      if (estProfesseur) {
        return Response.json({ error: 'Les reçus concernent les paiements des élèves.' }, { status: 400 })
      }
      return genererRecu(serviceClient, { paiement: paiement as StudentPayment, profileId, etablissementId })
    }

    const destinataireId = estProfesseur
      ? (paiement as { teacher_id: string }).teacher_id
      : (paiement as { student_id: string }).student_id

    /* Un paiement élève peut encore être rattaché à un simple PROSPECT (student_id vide,
       prospect_id renseigné) tant que la conversion en étudiant n'a pas eu lieu — la ligne
       elle-même est enregistrable dès la réservation (voir student_payments.prospect_id, 0056),
       une facture non. Sans ce garde-fou, l'insertion plus bas partait avec student_id ET
       teacher_id tous deux à null, ce que la contrainte `invoices_destinataire_unique` (0029,
       exactement l'un des deux) rejette avec un message Postgres brut au lieu d'une erreur
       compréhensible — bug signalé par le client le 2026-09-29. Même garde déjà en place pour le
       reçu (genererRecu, plus bas), reprise ici pour la facture. */
    if (!estProfesseur && !destinataireId) {
      return Response.json({ error: 'La facture sera disponible une fois le prospect converti en étudiant.' }, { status: 400 })
    }

    const { data: existante } = await serviceClient
      .from('invoices')
      .select('id, numero')
      .eq(estProfesseur ? 'teacher_payment_id' : 'payment_id', paiement.id)
      .not('numero', 'like', 'REC-%')
      .limit(1)
      .maybeSingle()
    if (existante) {
      return Response.json({ factureId: existante.id, numero: existante.numero, deja: true })
    }

    let objet = estProfesseur ? 'Rémunération' : 'Paiement'
    if (!estProfesseur && (paiement as { package_id: string | null }).package_id) {
      const { data: forfait } = await serviceClient
        .from('packages')
        .select('type_programme, total_heures')
        .eq('id', (paiement as { package_id: string }).package_id)
        .maybeSingle()
      if (forfait) objet = `Forfait ${forfait.type_programme} — ${forfait.total_heures} h`
    }
    if (estProfesseur) {
      const periodeDebut = (paiement as { periode_debut: string | null }).periode_debut
      const periodeFin = (paiement as { periode_fin: string | null }).periode_fin
      const mode = (paiement as { mode_remuneration: string }).mode_remuneration
      objet =
        periodeDebut
          ? `Rémunération du ${periodeDebut}${periodeFin ? ` au ${periodeFin}` : ''}`
          : mode === 'horaire'
            ? 'Rémunération des heures enseignées'
            : 'Rémunération'
    }

    const numero = await numeroSuivant(serviceClient, 'invoices', 'FAC', etablissementId)

    const { data: facture, error } = await serviceClient
      .from('invoices')
      .insert({
        etablissement_id: etablissementId,
        student_id: estProfesseur ? null : destinataireId,
        teacher_id: estProfesseur ? destinataireId : null,
        payment_id: estProfesseur ? null : paiement.id,
        teacher_payment_id: estProfesseur ? paiement.id : null,
        numero,
        /* Le statut de la facture suit le règlement réel de la ligne : payée seulement quand
           tout est encaissé, sinon simplement émise. */
        statut: paiement.montant_regle >= paiement.montant ? 'payee' : 'emise',
        objet,
        lignes: [{ description: objet, quantite: 1, prix_unitaire_ht: paiement.montant, tva_pct: 0 }],
        montant_ht: paiement.montant,
        montant_tva: 0,
        montant_ttc: paiement.montant,
        date_echeance: paiement.date_echeance,
        date_paiement: paiement.montant_regle >= paiement.montant ? paiement.date_paiement : null,
        created_by_profile_id: profileId,
      })
      .select('id, numero')
      .single()

    if (error || !facture) {
      return Response.json({ error: error?.message ?? 'La facture n’a pas pu être créée.' }, { status: 500 })
    }

    await creerNotification(serviceClient, {
      etablissementId,
      destinataireProfileId: destinataireId,
      type: 'facture',
      titre: `Nouvelle facture · ${facture.numero}`,
      message: objet,
      lien: estProfesseur ? '/professeur/factures' : '/mon-espace/paiements',
    })

    return Response.json({ factureId: facture.id, numero: facture.numero })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

type ServiceClient = Awaited<ReturnType<typeof requireAdmin>>['serviceClient']
type StudentPayment = {
  id: string
  etablissement_id: string
  student_id: string | null
  package_id: string | null
  montant: number
  montant_regle: number
  date_paiement: string | null
}

/* Reçu d'un paiement élève : couvre l'encaissé non encore couvert par un reçu précédent, pour
   que le cumul des reçus égale toujours ce que l'élève a versé. */
async function genererRecu(
  serviceClient: ServiceClient,
  { paiement, profileId, etablissementId }: { paiement: StudentPayment; profileId: string; etablissementId: string },
): Promise<Response> {
  if (!paiement.student_id) {
    return Response.json({ error: 'Le reçu sera disponible une fois le prospect converti en étudiant.' }, { status: 400 })
  }
  const { data: recus } = await serviceClient
    .from('invoices')
    .select('id, numero, montant_ttc')
    .eq('payment_id', paiement.id)
    .like('numero', 'REC-%')
  const couvert = (recus ?? []).reduce((t, r) => t + Number(r.montant_ttc), 0)
  const montant = Math.round((Number(paiement.montant_regle) - couvert) * 100) / 100
  if (montant <= 0) {
    return Response.json(
      { error: Number(paiement.montant_regle) > 0 ? 'Tout ce qui a été encaissé est déjà couvert par un reçu.' : 'Aucun encaissement à couvrir : enregistrez d’abord un paiement.' },
      { status: 400 },
    )
  }

  let objet = 'Reçu de paiement'
  if (paiement.package_id) {
    const { data: forfait } = await serviceClient.from('packages').select('type_programme, total_heures').eq('id', paiement.package_id).maybeSingle()
    if (forfait) objet = `Reçu — forfait ${forfait.type_programme} (${forfait.total_heures} h)`
  }
  const solde = Number(paiement.montant_regle) >= Number(paiement.montant)
  objet += solde ? (couvert > 0 ? ' — solde' : '') : ' — acompte'

  const { data: numero } = await serviceClient.rpc('numero_prochain_recu', { p_payment_id: paiement.id })
  const { data: recu, error } = await serviceClient
    .from('invoices')
    .insert({
      etablissement_id: etablissementId,
      student_id: paiement.student_id,
      payment_id: paiement.id,
      numero: (numero as string | null) ?? `REC-${new Date().getFullYear()}-${paiement.id.slice(0, 8)}-${(recus ?? []).length + 1}`,
      statut: 'payee',
      objet,
      lignes: [{ description: objet, quantite: 1, prix_unitaire_ht: montant, tva_pct: 0 }],
      montant_ht: montant,
      montant_tva: 0,
      montant_ttc: montant,
      date_paiement: paiement.date_paiement ?? new Date().toISOString().slice(0, 10),
      created_by_profile_id: profileId,
    })
    .select('id, numero')
    .single()
  if (error || !recu) {
    return Response.json({ error: error?.message ?? 'Le reçu n’a pas pu être créé.' }, { status: 500 })
  }

  await creerNotification(serviceClient, {
    etablissementId,
    destinataireProfileId: paiement.student_id,
    type: 'recu_paiement',
    titre: `Nouveau reçu · ${recu.numero}`,
    message: objet,
    lien: '/mon-espace/paiements',
  })

  return Response.json({ factureId: recu.id, numero: recu.numero })
}
