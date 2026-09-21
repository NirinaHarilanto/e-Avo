import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerNotification } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  table?: 'student_payments' | 'teacher_payments'
  id?: string
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

    const destinataireId = estProfesseur
      ? (paiement as { teacher_id: string }).teacher_id
      : (paiement as { student_id: string }).student_id

    const { data: existante } = await serviceClient
      .from('invoices')
      .select('id, numero')
      .eq(estProfesseur ? 'teacher_payment_id' : 'payment_id', paiement.id)
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

    const numero = await numeroFacture(serviceClient, etablissementId)

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

/* Numérotation FAC-<année>-<rang>, continue sur l'année civile. Le rang se déduit des factures
   déjà émises cette année plutôt que d'un compteur séparé : une séquence en base resterait
   désynchronisée des reçus créés par le trigger 0030, qui ne passent pas par ici. */
async function numeroFacture(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  etablissementId: string,
): Promise<string> {
  const annee = new Date().getFullYear()
  const prefixe = `FAC-${annee}-`
  const { data } = await serviceClient
    .from('invoices')
    .select('numero')
    .eq('etablissement_id', etablissementId)
    .like('numero', `${prefixe}%`)

  const dernier = (data ?? []).reduce((max, ligne) => {
    const rang = Number(ligne.numero.slice(prefixe.length))
    return Number.isFinite(rang) && rang > max ? rang : max
  }, 0)
  return `${prefixe}${String(dernier + 1).padStart(4, '0')}`
}
