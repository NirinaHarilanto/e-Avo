import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { annulerVisio } from '../_lib/synchroniserVisio.js'
import { formaterDateSeance, notifierParticipantsSeance } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

/**
 * Supprime un étudiant ou un professeur depuis l'espace admin — demande client du 2026-09-24 :
 * « toutes les informations du supprimé devraient TOUS être supprimées [...] SAUF les historiques
 * de paiement ». Jusqu'ici la suppression était uniquement douce (`status = 'suspended'`, tout
 * l'historique conservé) : un élève supprimé pouvait garder des séances, un forfait, un
 * rattachement de vague/classe visibles quelque part dans l'app (c'est exactement ce qui a produit
 * un niveau incohérent pour un élève encore rattaché à un programme DUO qu'on croyait clos).
 *
 * La ligne `profiles` elle-même N'EST PAS supprimée (ni son compte Auth) : `student_payments`
 * (paiements reçus d'un étudiant) et `teacher_payments`/`invoices` (rémunérations d'un professeur)
 * DOIVENT rester identifiables par un nom — les supprimer avec le profil rendrait cet historique
 * muet. La ligne `profiles` reste donc, comme avant, passée en `status = 'suspended'` avec
 * `email = null` (retire la personne des listes actives, libère son adresse) et son compte Auth
 * soft-deleted. C'est TOUT LE RESTE — séances, heures, forfaits, rattachements pédagogiques,
 * documents, contrats, notifications — qui est désormais un vrai DELETE, pas une conservation
 * silencieuse.
 *
 * Exception posée le 2026-10-10, à la demande du client : `teacher_assignments` (les périodes
 * « cet élève a eu ce professeur du … au … ») N'EST PLUS supprimée quand c'est le PROFESSEUR qui
 * part — « il faut garder la traçabilité des noms des professeurs dans le suivi pédagogique des
 * étudiants [...] à l'avenir, respecter cette exigence ». C'est l'historique pédagogique DE
 * L'ÉLÈVE, pas une donnée propre au professeur ; voir purgerDonneesProfesseur, qui ferme
 * seulement l'affectation si elle était encore ouverte. `teacher_assignments` reste en revanche
 * un vrai DELETE quand c'est l'ÉLÈVE qui part (purgerDonneesEtudiant) : c'est bien sa propre
 * fiche qui disparaît dans ce cas, aucune exception à faire.
 *
 * Chaque étape ne touche QUE les lignes propres à la personne supprimée : une séance ou une
 * écriture d'heures partagée (binôme DUO, classe de cours collectif) n'est jamais retirée pour
 * les autres participants, seule la part de la personne supprimée l'est.
 */
async function purgerDocuments(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
): Promise<void> {
  const { data: documents } = await serviceClient.from('documents').select('id, storage_path').eq('owner_profile_id', profileId)
  if (!documents || documents.length === 0) return
  await serviceClient.storage.from('documents').remove(documents.map((d) => d.storage_path))
  await serviceClient.from('documents').delete().eq('owner_profile_id', profileId)
}

async function purgerUnDocument(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  documentId: string,
): Promise<void> {
  const { data: document } = await serviceClient.from('documents').select('storage_path').eq('id', documentId).maybeSingle()
  if (!document) return
  await serviceClient.storage.from('documents').remove([document.storage_path])
  await serviceClient.from('documents').delete().eq('id', documentId)
}

/* Retire la personne des rendez-vous « autre » (evenements_admin) où elle figurait comme
   participant obligatoire ou optionnel — l'événement lui-même reste, pour les autres invités. */
async function retirerDesEvenements(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
): Promise<void> {
  const [{ data: obligatoires }, { data: optionnels }] = await Promise.all([
    serviceClient.from('evenements_admin').select('id, participants_obligatoires, participants_optionnels').contains('participants_obligatoires', [profileId]),
    serviceClient.from('evenements_admin').select('id, participants_obligatoires, participants_optionnels').contains('participants_optionnels', [profileId]),
  ])
  const evenementParId = new Map<string, { id: string; participants_obligatoires: string[]; participants_optionnels: string[] }>()
  for (const e of [...(obligatoires ?? []), ...(optionnels ?? [])]) evenementParId.set(e.id, e)
  for (const evenement of evenementParId.values()) {
    await serviceClient
      .from('evenements_admin')
      .update({
        participants_obligatoires: evenement.participants_obligatoires.filter((id) => id !== profileId),
        participants_optionnels: evenement.participants_optionnels.filter((id) => id !== profileId),
      })
      .eq('id', evenement.id)
  }
}

/* Contrats : supprimé (PDF généré compris) s'il en est le destinataire PRINCIPAL, simplement
   détaché s'il n'en est que le second signataire d'un binôme DUO — pour ne jamais perdre le
   contrat de l'autre membre. */
async function purgerContrats(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
): Promise<void> {
  const { data: contrats } = await serviceClient.from('contracts').select('id, document_id').eq('destinataire_profile_id', profileId)
  for (const contrat of contrats ?? []) {
    if (contrat.document_id) await purgerUnDocument(serviceClient, contrat.document_id)
  }
  if (contrats && contrats.length > 0) {
    await serviceClient.from('contracts').delete().eq('destinataire_profile_id', profileId)
  }
  await serviceClient.from('contracts').update({ destinataire_secondaire_profile_id: null }).eq('destinataire_secondaire_profile_id', profileId)
}

async function purgerDonneesEtudiant(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  studentId: string,
  etablissementId: string,
  acteurId: string,
): Promise<void> {
  // Séances à venir qui se retrouveraient sans aucun inscrit une fois cet élève retiré — calculé
  // AVANT la suppression des inscriptions, pour pouvoir les annuler ensuite (le passé, lui, n'est
  // jamais retouché : c'est de l'historique pédagogique qui concerne aussi le professeur).
  const maintenant = new Date().toISOString()
  const { data: inscriptionsFutures } = await serviceClient
    .from('session_enrollments')
    .select('session_id, sessions!inner(id, debut, teacher_id, statut)')
    .eq('student_id', studentId)
    .gt('sessions.debut', maintenant)
    .eq('sessions.statut', 'planifiee')
  type LigneInscriptionFuture = { session_id: string; sessions: { id: string; debut: string; teacher_id: string; statut: string } }
  const seancesFuturesParId = new Map(
    (inscriptionsFutures ?? []).map((i) => [(i as unknown as LigneInscriptionFuture).session_id, (i as unknown as LigneInscriptionFuture).sessions]),
  )
  const sessionIdsFutures = [...seancesFuturesParId.keys()]

  await purgerDocuments(serviceClient, studentId)
  await serviceClient.from('document_permissions').delete().eq('profile_id', studentId)
  await purgerContrats(serviceClient, studentId)
  await serviceClient.from('notifications').delete().eq('destinataire_profile_id', studentId)
  await serviceClient.from('niveau_evaluations').delete().eq('student_id', studentId)
  await serviceClient.from('session_satisfaction').delete().eq('student_id', studentId)
  await serviceClient.from('demandes_forfait').delete().eq('student_id', studentId)

  // Heures et inscriptions aux séances : la trace pédagogique de CETTE personne est purgée : la
  // séance elle-même (partagée en DUO/collectif) et les écritures des autres participants restent
  // intactes.
  await serviceClient.from('hour_ledger').delete().eq('student_id', studentId)
  await serviceClient.from('session_enrollments').delete().eq('student_id', studentId)
  if (sessionIdsFutures.length > 0) {
    const { data: restantes } = await serviceClient.from('session_enrollments').select('session_id').in('session_id', sessionIdsFutures)
    const encoreOccupees = new Set((restantes ?? []).map((r: { session_id: string }) => r.session_id))
    const aAnnuler = sessionIdsFutures.filter((id) => !encoreOccupees.has(id))
    if (aAnnuler.length > 0) {
      await serviceClient.from('sessions').update({ statut: 'annulee' }).in('id', aAnnuler)
      // Même traitement que l'annulation normale (annuler-seance.ts) : le lien de
      // visioconférence est retiré et le professeur prévenu — sans ce garde-fou, la séance
      // disparaissait de l'agenda de l'élève supprimé mais restait « planifiée » dans celui de
      // son professeur, lien Meet compris (demande client du 2026-09-29 : « efface les
      // évènements et rendez-vous concernant les personnes qui ont été supprimées »).
      await Promise.all(
        aAnnuler.map(async (sessionId) => {
          await annulerVisio(serviceClient, { sessionId, etablissementId })
          const seance = seancesFuturesParId.get(sessionId)
          if (!seance) return
          await notifierParticipantsSeance(serviceClient, {
            etablissementId,
            sessionId,
            teacherId: seance.teacher_id,
            acteurId,
            type: 'seance_annulee',
            titre: 'Séance annulée',
            message: `La séance du ${formaterDateSeance(seance.debut)} a été annulée : son dernier élève inscrit a été supprimé.`,
          })
        }),
      )
    }
  }

  await serviceClient.from('teacher_assignments').delete().eq('student_id', studentId)
  await serviceClient.from('cohort_enrollments').delete().eq('student_id', studentId)

  // Forfaits : supprimés — mais l'historique de paiement reste (demande client du 2026-09-24). On
  // détache seulement le forfait que chaque paiement référençait, jamais la ligne de paiement.
  const { data: packages } = await serviceClient.from('packages').select('id').eq('student_id', studentId)
  const packageIds = (packages ?? []).map((p: { id: string }) => p.id)
  if (packageIds.length > 0) {
    await serviceClient.from('student_payments').update({ package_id: null }).in('package_id', packageIds)
    await serviceClient.from('packages').delete().in('id', packageIds)
  }

  await retirerDesEvenements(serviceClient, studentId)
}

async function purgerDonneesProfesseur(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  teacherId: string,
  etablissementId: string,
  acteurId: string,
): Promise<void> {
  // Séances encore planifiées de ce professeur (individuelles ou collectives) : `teacher_id` est
  // une colonne obligatoire de `sessions`, rien ne les détache automatiquement de lui. Restées
  // « planifiee » elles continuaient jusqu'ici de s'afficher, lien Meet compris, dans l'agenda de
  // leurs élèves ET dans le pipeline admin — avec un professeur désormais supprimé en face
  // (demande client du 2026-09-29 : « efface les évènements et rendez-vous concernant les
  // personnes qui ont été supprimées »). Le passé, lui, n'est jamais retouché : c'est l'historique
  // pédagogique des élèves qui l'ont suivi, indépendant du sort de ce professeur.
  const maintenant = new Date().toISOString()
  const { data: seancesFutures } = await serviceClient
    .from('sessions')
    .select('id, debut')
    .eq('teacher_id', teacherId)
    .eq('statut', 'planifiee')
    .gt('debut', maintenant)
  const idsSeancesFutures = (seancesFutures ?? []).map((s) => s.id)
  if (idsSeancesFutures.length > 0) {
    await serviceClient.from('sessions').update({ statut: 'annulee' }).in('id', idsSeancesFutures)
    await Promise.all(
      (seancesFutures ?? []).map(async (seance) => {
        await annulerVisio(serviceClient, { sessionId: seance.id, etablissementId })
        // `notifierParticipantsSeance` prévient aussi le professeur par défaut (`teacherId`) :
        // sans effet ici puisque toutes ses notifications sont purgées juste après et que son
        // compte est de toute façon désactivé dans la foulée — seuls ses élèves comptent
        // vraiment recevoir cette notification.
        await notifierParticipantsSeance(serviceClient, {
          etablissementId,
          sessionId: seance.id,
          teacherId,
          acteurId,
          type: 'seance_annulee',
          titre: 'Séance annulée',
          message: `La séance du ${formaterDateSeance(seance.debut)} a été annulée : le professeur a quitté l’établissement.`,
        })
      }),
    )
  }

  await purgerDocuments(serviceClient, teacherId)
  await serviceClient.from('document_permissions').delete().eq('profile_id', teacherId)
  await purgerContrats(serviceClient, teacherId)
  await serviceClient.from('notifications').delete().eq('destinataire_profile_id', teacherId)
  await serviceClient.from('session_reports').delete().eq('teacher_id', teacherId)

  // Écritures d'heures créditées à ce professeur : purgées — ce ne sont que des lignes de calcul
  // de sa propre rémunération, sans intérêt une fois son compte parti.
  await serviceClient.from('hour_ledger').delete().eq('teacher_id', teacherId)

  /* `teacher_assignments`, à l'inverse, n'est PLUS supprimée depuis le 2026-10-10 : demande
     client explicite, « il faut garder la traçabilité des noms des professeurs dans le suivi
     pédagogique des étudiants [...] à l'avenir, respecter cette exigence ». Exactement comme les
     séances (voir juste au-dessus) : c'est l'historique pédagogique DE L'ÉLÈVE, pas une donnée
     propre à ce professeur — qui dates, qui motifs de changement compris, doit survivre à son
     départ.
     Une affectation encore OUVERTE (`date_fin` nulle) est en revanche close ici, jamais laissée
     telle quelle : `useDossierEtudiant.ts` reconnaît « le professeur actuel de l'élève » à cette
     seule colonne (`date_fin is null`), et un professeur supprimé ne doit plus jamais être désigné
     comme tel — ce serait rendre l'élève responsable d'un suivi qui n'a plus personne derrière
     lui. Fermée à la date du jour, avec un motif qui explique le pourquoi sans se confondre avec
     un vrai changement de professeur choisi par l'admin. */
  await serviceClient
    .from('teacher_assignments')
    .update({
      date_fin: new Date().toISOString().slice(0, 10),
      motif_changement: 'Professeur retiré de l’établissement',
    })
    .eq('teacher_id', teacherId)
    .is('date_fin', null)

  // Vagues et classes de cours collectif qu'il animait : détachées, jamais supprimées (d'autres
  // élèves peuvent encore y être inscrits).
  await serviceClient.from('cohorts').update({ teacher_id: null }).eq('teacher_id', teacherId)
  await serviceClient.from('cohort_classes').update({ teacher_id: null }).eq('teacher_id', teacherId)

  await retirerDesEvenements(serviceClient, teacherId)

  // teacher_payments et invoices (ses rémunérations) : préservés intégralement, même règle que
  // student_payments côté étudiant — demande client du 2026-09-24.
}

/* Un binôme DUO n'a de sens qu'à deux : si l'un des deux membres est supprimé alors que l'autre
   n'a JAMAIS activé son compte (`status = 'pending'`), ce second compte reste orphelin pour
   toujours — sans principal ni secondaire en face, il ne mènera jamais nulle part, mais son
   adresse e-mail reste retenue indéfiniment côté Auth et bloque toute réinscription future avec
   cette même adresse (bug réel constaté le 2026-09-23, voir aussi la garde de secours dans
   api/_lib/creerCompte.ts). On ne touche qu'aux invitations jamais activées : un partenaire déjà
   actif (`approved`/`en_pause`) garde son compte et son dossier intacts, même privé de l'autre
   moitié de son duo — cette suppression-ci reste volontairement silencieuse sur ce cas, laissé à
   une décision explicite de l'admin. */
async function nettoyerPartenaireDuoJamaisActive(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
  duoPartenaireId: string | null,
): Promise<void> {
  const [{ data: viaPrincipal }, { data: viaSecondaire }] = await Promise.all([
    duoPartenaireId
      ? serviceClient.from('profiles').select('id, status').eq('id', duoPartenaireId).maybeSingle()
      : Promise.resolve({ data: null }),
    serviceClient.from('profiles').select('id, status').eq('duo_partenaire_id', profileId).maybeSingle(),
  ])

  for (const candidat of [viaPrincipal, viaSecondaire]) {
    if (!candidat || candidat.status !== 'pending') continue
    await serviceClient.from('profiles').update({ status: 'suspended', email: null }).eq('id', candidat.id)
    await serviceClient.auth.admin.deleteUser(candidat.id, true)
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId, profileId } = await requireAdmin(request)
    const body = (await request.json()) as { profileId?: string }
    if (!body.profileId) {
      return Response.json({ error: 'Identifiant manquant.' }, { status: 400 })
    }
    if (body.profileId === profileId) {
      return Response.json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, { status: 400 })
    }

    const { data: cible, error: erreurCible } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id, duo_partenaire_id')
      .eq('id', body.profileId)
      .maybeSingle()

    if (erreurCible || !cible || cible.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Compte introuvable.' }, { status: 404 })
    }
    if (cible.role !== 'etudiant' && cible.role !== 'professeur') {
      return Response.json({ error: 'Seuls les comptes étudiant ou professeur peuvent être supprimés ici.' }, { status: 403 })
    }

    if (cible.role === 'etudiant') {
      await purgerDonneesEtudiant(serviceClient, body.profileId, etablissementId, profileId)
    } else {
      await purgerDonneesProfesseur(serviceClient, body.profileId, etablissementId, profileId)
    }

    /* `email` remis à null en même temps que le statut — pas seulement l'e-mail Auth (anonymisé
       plus bas par `deleteUser(..., true)`, ce qui libère bien l'adresse pour un nouveau compte
       Auth). `profiles.email` n'a aucune contrainte d'unicité et n'est jamais touché par ce
       soft-delete : sans ce correctif, un ré-enregistrement avec la même adresse (exactement le
       scénario prévu par cette suppression — « supprimer puis se réinscrire ») laissait DEUX
       lignes `profiles` portant le même e-mail. Bug réel rencontré le 2026-09-23 :
       `api/auth/verifier-email.ts` (`.maybeSingle()`) échouait silencieusement dès qu'une
       recherche par e-mail retombait sur ces deux lignes, et l'écran de connexion répondait
       « adresse inconnue » à un compte pourtant bien réel. La ligne `profiles` elle-même n'est PAS
       supprimée : student_payments/teacher_payments doivent rester identifiables par un nom
       (demande client du 2026-09-24, voir le commentaire d'en-tête de ce fichier). */
    const { error: erreurStatut } = await serviceClient
      .from('profiles')
      .update({ status: 'suspended', email: null })
      .eq('id', body.profileId)
    if (erreurStatut) {
      return Response.json({ error: erreurStatut.message }, { status: 500 })
    }

    await nettoyerPartenaireDuoJamaisActive(serviceClient, body.profileId, cible.duo_partenaire_id)

    const { error: erreurAuth } = await serviceClient.auth.admin.deleteUser(body.profileId, true)
    if (erreurAuth) {
      return Response.json({ error: erreurAuth.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
