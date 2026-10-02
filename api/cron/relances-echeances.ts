/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creerNotification } from '../_lib/notifications.js'
import { envoyerDepuisModele, montantLisible } from '../_lib/templatesEmail.js'

export const config = { runtime: 'edge' }

/**
 * Relances automatiques des échéances de paiement — demande client du 2026-09-23 (point 12) :
 * « rajoute également la possibilité de planifier une échéance de paiement avec les relances
 * automatiques liées au paiement à l'approche des échéances ».
 *
 * Déclenché une fois par jour par le cron Vercel (voir vercel.json). Une échéance n'est relancée
 * qu'une seule fois — `relance_envoyee_le` sert de garde-fou : sans lui, un élève recevrait la
 * même notification chaque jour jusqu'à son paiement.
 *
 * Le délai de prévenance est propre à chaque établissement (`relance_echeance_jours`), un
 * échéancier ne se relançant pas de la même façon selon les habitudes de la maison.
 */
export default async function handler(request: Request): Promise<Response> {
  /* Vercel signe ses appels de cron avec `CRON_SECRET`. Sans cette vérification, n'importe qui
     pourrait déclencher une vague de notifications en appelant l'URL publiquement.
     Refus aussi quand le secret est ABSENT de l'environnement : la version précédente laissait
     alors passer tout le monde (`if (secret && …)`), et ce n'était plus tenable à partir du
     2026-10-01, date à laquelle cette route s'est mise à expédier de vrais e-mails aux élèves
     (reçus et fin d'heures) et non plus seulement des notifications internes. Mieux vaut un cron
     qui s'arrête bruyamment qu'une URL publique qui envoie du courrier. */
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    return Response.json({ error: 'Configuration Supabase manquante.' }, { status: 500 })
  }
  const serviceClient = createClient<Database>(url, serviceKey)

  const { data: etablissements } = await serviceClient.from('etablissements').select('id, relance_echeance_jours')
  const delaiParEtablissement = new Map((etablissements ?? []).map((e) => [e.id, e.relance_echeance_jours]))

  /* Une seule requête pour toutes les échéances encore dues et jamais relancées : le tri par
     établissement se fait ensuite en mémoire, il y en a trop peu pour justifier une requête par
     établissement. La borne haute est le délai le plus généreux configuré. */
  const delaiMax = Math.max(0, ...[...delaiParEtablissement.values()])
  const limite = new Date()
  limite.setDate(limite.getDate() + delaiMax)

  const { data: echeances, error } = await serviceClient
    .from('paiement_echeances')
    .select('*')
    .is('reglee_le', null)
    .is('relance_envoyee_le', null)
    .lte('date_echeance', limite.toISOString().slice(0, 10))
  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const paiementIds = [...new Set((echeances ?? []).map((e) => e.student_payment_id))]
  const { data: paiements } = paiementIds.length
    ? await serviceClient.from('student_payments').select('id, student_id, devise').in('id', paiementIds)
    : { data: [] }
  const paiementParId = new Map((paiements ?? []).map((p) => [p.id, p]))

  const aujourdhui = new Date()
  let envoyees = 0

  for (const echeance of echeances ?? []) {
    const delai = delaiParEtablissement.get(echeance.etablissement_id)
    if (delai === undefined) continue

    const seuil = new Date(aujourdhui)
    seuil.setDate(seuil.getDate() + delai)
    if (echeance.date_echeance > seuil.toISOString().slice(0, 10)) continue

    const paiement = paiementParId.get(echeance.student_payment_id)
    if (!paiement?.student_id) continue

    const echue = echeance.date_echeance < aujourdhui.toISOString().slice(0, 10)
    const quand = new Date(echeance.date_echeance).toLocaleDateString('fr-FR')
    await creerNotification(serviceClient, {
      etablissementId: echeance.etablissement_id,
      destinataireProfileId: paiement.student_id,
      type: 'echeance_paiement',
      titre: echue ? 'Échéance de paiement dépassée' : 'Échéance de paiement à venir',
      message: `${echeance.libelle ? `${echeance.libelle} — ` : ''}${echeance.montant} ${paiement.devise} ${
        echue ? `étaient attendus le ${quand}.` : `sont attendus le ${quand}.`
      }`,
      lien: '/etudiant/paiements',
    })

    await serviceClient
      .from('paiement_echeances')
      .update({ relance_envoyee_le: new Date().toISOString() })
      .eq('id', echeance.id)
    envoyees += 1
  }

  const recus = await annoncerRecus(serviceClient)
  const finsDHeures = await alerterFinDHeures(serviceClient)

  return Response.json({ relances: envoyees, recus, finsDHeures })
}

/**
 * Modèle 2.3 — « Facture (accusé de réception du paiement) », envoi automatique décidé le
 * 2026-10-01. Le reçu lui-même est créé par un trigger au passage d'un paiement à « payé »
 * (0030) : un trigger SQL ne pouvant pas envoyer d'e-mail, c'est ici qu'on reprend les reçus
 * récents jamais annoncés. `email_envoye_le` (0095) garantit un seul envoi par reçu.
 *
 * Fenêtre de 7 jours : au-delà, annoncer un paiement reçu la semaine passée n'a plus de sens, et
 * ça éviterait surtout d'inonder un élève si la colonne venait à être remise à zéro.
 */
async function annoncerRecus(serviceClient: ReturnType<typeof createClient<Database>>): Promise<number> {
  const depuis = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data: recus } = await serviceClient
    .from('invoices')
    .select('id, etablissement_id, student_id, montant_ttc, numero')
    .is('email_envoye_le', null)
    .gte('created_at', depuis)
    .not('student_id', 'is', null)
    /* `invoices` porte DEUX choses depuis 0080 : les reçus (`REC-…`, créés par le trigger à
       l'encaissement) et les factures (`FAC-…`, émises à la main et parfois impayées). Le modèle
       2.3 est un accusé de réception de paiement : sans ce filtre, une facture au statut « emise »
       annonçait à l'élève un règlement qu'il n'a jamais fait, et un paiement couvert à la fois par
       une facture et un reçu partait en double. `numero like 'REC-%'` est le discriminant déjà
       utilisé en base (voir `numero_prochain_recu`, 0080). */
    .like('numero', 'REC-%')
    /* Un reçu annulé entre-temps ne s'annonce pas. */
    .eq('statut', 'payee')

  let envoyes = 0
  for (const recu of recus ?? []) {
    if (!recu.student_id) continue
    const { data: eleve } = await serviceClient
      .from('profiles')
      .select('prenom, email')
      .eq('id', recu.student_id)
      .maybeSingle()
    if (!eleve?.email) continue

    const resultat = await envoyerDepuisModele(serviceClient, {
      etablissementId: recu.etablissement_id,
      reference: '2.3',
      destinataires: [eleve.email],
      /* `invoices` ne porte pas de devise : tous les montants de l'application sont en ariary
         depuis la correction du 2026-09-29 (le defaut EUR de 0019 etait un reliquat). */
      valeurs: { prenom: eleve.prenom, montant: montantLisible(recu.montant_ttc) },
    })
    /* Marqué même en cas d'échec d'envoi : sans cela, un établissement sans clé Resend
       retenterait tous les reçus chaque matin indéfiniment. L'admin a de toute façon le reçu
       dans l'espace de l'élève et peut l'envoyer à la main depuis le modèle 2.3. */
    await serviceClient.from('invoices').update({ email_envoye_le: new Date().toISOString() }).eq('id', recu.id)
    if (resultat.envoye) envoyes += 1
  }
  return envoyes
}

/**
 * Modèle 5.3 — « Fin du volume d'heures : renouvellement ». Déclenché quand le restant passe sous
 * le seuil de l'établissement (`seuil_alerte_heures_restantes`, 0095, 5 h par défaut), une seule
 * fois par forfait grâce à `email_fin_heures_le`.
 *
 * Le restant se calcule sur le CUMUL des forfaits de l'élève et ses heures consommées
 * (`student_hours_summary`), comme partout ailleurs dans l'application : un ajout de forfait
 * (0061) additionne des heures à un total déjà entamé. Alerter forfait par forfait annoncerait
 * une fin de parcours à un élève qui vient d'en racheter un.
 */
async function alerterFinDHeures(serviceClient: ReturnType<typeof createClient<Database>>): Promise<number> {
  const { data: etablissements } = await serviceClient.from('etablissements').select('id, seuil_alerte_heures_restantes')
  const seuilParEtablissement = new Map((etablissements ?? []).map((e) => [e.id, e.seuil_alerte_heures_restantes]))

  const { data: forfaits } = await serviceClient
    .from('packages')
    .select('id, etablissement_id, student_id, total_heures')
    .is('email_fin_heures_le', null)

  /* Regroupé par élève : le seuil porte sur son total restant, et un seul e-mail part même s'il a
     plusieurs forfaits encore non marqués. */
  const parEleve = new Map<string, { etablissementId: string; forfaitIds: string[]; total: number }>()
  for (const f of forfaits ?? []) {
    if (!f.student_id) continue
    const entree = parEleve.get(f.student_id) ?? { etablissementId: f.etablissement_id, forfaitIds: [], total: 0 }
    entree.forfaitIds.push(f.id)
    entree.total += f.total_heures
    parEleve.set(f.student_id, entree)
  }

  let envoyes = 0
  for (const [studentId, entree] of parEleve) {
    const seuil = seuilParEtablissement.get(entree.etablissementId) ?? 5
    const { data: resume } = await serviceClient
      .from('student_hours_summary')
      .select('heures_consommees')
      .eq('student_id', studentId)
      .maybeSingle()

    /* Tous forfaits confondus, y compris ceux déjà marqués : `entree.total` ne couvre que les
       non marqués, il faut le total réel pour ne pas sous-estimer le restant. */
    const { data: tousForfaits } = await serviceClient.from('packages').select('total_heures').eq('student_id', studentId)
    const totalHeures = (tousForfaits ?? []).reduce((somme, f) => somme + f.total_heures, 0)
    const restantes = totalHeures - (resume?.heures_consommees ?? 0)

    // Au-dessus du seuil : rien à faire, et surtout rien à marquer (l'alerte reste à venir).
    if (restantes > seuil) continue
    // Volume déjà épuisé : le renouvellement « sans interruption » n'a plus d'objet, et l'élève a
    // reçu les relances d'échéance. On marque pour ne pas y revenir chaque matin.
    if (restantes <= 0) {
      for (const id of entree.forfaitIds) {
        await serviceClient.from('packages').update({ email_fin_heures_le: new Date().toISOString() }).eq('id', id)
      }
      continue
    }

    const { data: eleve } = await serviceClient.from('profiles').select('prenom, email').eq('id', studentId).maybeSingle()
    const { data: affectation } = await serviceClient
      .from('teacher_assignments')
      .select('teacher_id')
      .eq('student_id', studentId)
      .is('date_fin', null)
      .maybeSingle()
    const { data: professeur } = affectation
      ? await serviceClient.from('profiles').select('prenom, nom').eq('id', affectation.teacher_id).maybeSingle()
      : { data: null as { prenom: string | null; nom: string | null } | null }

    if (eleve?.email) {
      const resultat = await envoyerDepuisModele(serviceClient, {
        etablissementId: entree.etablissementId,
        reference: '5.3',
        destinataires: [eleve.email],
        valeurs: {
          prenom: eleve.prenom,
          heures_restantes: String(Math.round(restantes * 10) / 10),
          nom_formateur: professeur ? [professeur.prenom, professeur.nom].filter(Boolean).join(' ') : undefined,
        },
      })
      if (resultat.envoye) envoyes += 1
    }
    for (const id of entree.forfaitIds) {
      await serviceClient.from('packages').update({ email_fin_heures_le: new Date().toISOString() }).eq('id', id)
    }
  }
  return envoyes
}
