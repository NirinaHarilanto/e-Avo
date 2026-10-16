import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { annulerVisio } from '../_lib/synchroniserVisio.js'
import { formaterDateSeance, notifierParticipantsSeance } from '../_lib/notifications.js'
import { integrationHoteReunion, supprimerEvenement } from '../_lib/google.js'

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
 *
 * Complété le 2026-10-16, à la demande du client (« il faut que cet étudiant n'apparaisse plus
 * dans l'application, que ce soit en DUO, individuel ou collectif ») après qu'une élève supprimée
 * restait visible dans Séances & visio : quatre traces qu'aucune étape ci-dessus ne couvrait,
 * purgées désormais pour les deux rôles identiquement, APRÈS la purge propre au rôle —
 * `purgerDossiersDocuments`, `purgerPartagesDocuments`, `purgerMessages`, `rompreLienDuo`
 * (voir chacune pour le détail). Toute colonne de PROFILES(id) ajoutée à l'avenir sur une table
 * visible par d'autres personnes doit rejoindre cette liste au même endroit — c'est la seule façon
 * d'empêcher une personne supprimée de ressurgir ailleurs sans qu'un développeur ait à s'en
 * souvenir page par page.
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

/* Arborescence de dossiers (0058) appartenant à la personne — jamais purgée jusqu'ici, alors que
 * `purgerDocuments` juste au-dessus ne vide que les FICHIERS. `document_dossiers.parent_id` est en
 * `on delete restrict` (volontaire, voir cette migration) : un dossier contenant encore un
 * sous-dossier refuse de disparaître. `purgerDocuments` a déjà vidé tous les fichiers qui
 * pointaient vers ces dossiers (`documents.dossier_id`, également `on delete restrict`), donc
 * seules les feuilles de l'arborescence bloquent encore — on les retire couche par couche jusqu'à
 * ce qu'il n'en reste plus. Bornée à 20 passes : la profondeur réelle d'une arborescence saisie à
 * la main ne dépasse jamais ça, et une boucle sans fin signalerait un bug ailleurs plutôt que d'y
 * rester suspendue indéfiniment.
 */
async function purgerDossiersDocuments(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
): Promise<void> {
  for (let passe = 0; passe < 20; passe++) {
    const { data: dossiers } = await serviceClient.from('document_dossiers').select('id').eq('proprietaire_profile_id', profileId)
    if (!dossiers || dossiers.length === 0) return
    const ids = dossiers.map((d) => d.id)
    const { data: enfants } = await serviceClient.from('document_dossiers').select('parent_id').in('parent_id', ids)
    const idsAvecEnfant = new Set((enfants ?? []).map((e) => e.parent_id).filter((id): id is string => id !== null))
    const feuilles = ids.filter((id) => !idsAvecEnfant.has(id))
    if (feuilles.length === 0) return
    await serviceClient.from('document_dossiers').delete().in('id', feuilles)
  }
}

/* Partages ponctuels d'un document (0059 — « un utilisateur ordinaire ouvre la vue d'un de SES
 * fichiers à quelqu'un », distinct de `document_permissions` ci-dessus). Un document qu'ELLE
 * possédait est déjà réglé : `purgerDocuments` l'a supprimé, et `document_partages.document_id`
 * cascade dessus. Restent deux cas qu'aucune cascade ne couvre, parce que le DOCUMENT appartient à
 * quelqu'un d'autre : un fichier qu'on lui avait partagé (elle figure comme destinataire) et un
 * fichier qu'elle avait elle-même partagé à un tiers (elle figure comme émetteur). Sans ce geste,
 * son nom restait affiché « partagé avec » dans la fiche du document chez son propriétaire — vu le
 * 2026-10-16 sur la liste des accès d'un document resté partagé avec un compte déjà supprimé.
 */
async function purgerPartagesDocuments(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
): Promise<void> {
  await serviceClient.from('document_partages').delete().eq('destinataire_profile_id', profileId)
  await serviceClient.from('document_partages').delete().eq('partage_par_profile_id', profileId)
}

/* Messagerie (0090, « chaque personne peut envoyer un message à toute personne enregistrée »).
 * Jamais purgée jusqu'ici : un message qu'elle avait envoyé ou reçu restait entier dans la boîte
 * de l'AUTRE participant, qui continuait donc à voir son nom. Conforme à la règle posée en tête de
 * ce fichier — « toutes les informations du supprimé devraient TOUTES être supprimées » — les
 * messages n'étant pas un historique de paiement, rien ne justifie de les épargner.
 */
async function purgerMessages(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
): Promise<void> {
  await serviceClient.from('messages').delete().eq('expediteur_profile_id', profileId)
  await serviceClient.from('messages').delete().eq('destinataire_profile_id', profileId)
}

/* Lien DUO (0054) : SEUL le SECONDAIRE porte `duo_partenaire_id`, pointant vers le PRINCIPAL (voir
 * lib/duo.ts). Supprimer un des deux ne touchait jusqu'ici que les données DE la personne
 * supprimée — jamais la référence que l'AUTRE garde vers elle :
 *   - si la personne supprimée était le PRINCIPAL, le secondaire continue de pointer vers un
 *     compte mort. Deux dégâts concrets constatés le 2026-10-16 : il reste affiché « en duo »
 *     partout où la liste des élèves se construit sans tenir compte du statut du partenaire (la
 *     fiche Étudiants s'en sort par coïncidence — elle masque tout profil porteur d'un
 *     `duo_partenaire_id`, même orphelin — mais Séances & visio, qui liste chaque élève
 *     individuellement, non) ; et SA PROPRE page « Mon espace » cesse de fonctionner, puisque
 *     `idEtudiantEffectif` (ProfileContext.tsx) le redirige vers le dossier de son principal,
 *     qui n'existe plus — `useDossierEtudiant` refuse alors tout court (« Étudiant introuvable »).
 *   - si la personne supprimée était elle-même SECONDAIRE, nettoyer sa propre ligne est sans
 *     effet pratique (son compte est suspendu), mais garde la base cohérente.
 * Les deux sens sont donc rompus ici : toute AUTRE ligne qui pointait vers elle, et sa propre
 * ligne si c'est elle qui pointait vers quelqu'un. Le secondaire orphelin retombe en élève
 * individuel — un état déjà pleinement géré par le reste de l'application (c'est l'état par
 * défaut de tout élève hors DUO), pas un cas spécial à inventer.
 */
async function rompreLienDuo(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
): Promise<void> {
  await serviceClient.from('profiles').update({ duo_partenaire_id: null, duo_nom_groupe: null }).eq('duo_partenaire_id', profileId)
  await serviceClient.from('profiles').update({ duo_partenaire_id: null, duo_nom_groupe: null }).eq('id', profileId)
}

/* Retire la personne des rendez-vous « autre » (evenements_admin) où elle figurait comme
 * participant obligatoire ou optionnel — l'événement lui-même reste, pour les autres invités.
 *
 * Corrigé le 2026-10-16 : `evenements_admin_participants` (0045) interdit en base un événement
 * sans AUCUN participant, obligatoire ou optionnel — ce qui arrive dès que la personne retirée en
 * était la dernière. L'ancien code ne vérifiait jamais le résultat de l'UPDATE : Postgres refusait
 * silencieusement la ligne (erreur 23514), avalée sans un mot par le client JS faute d'avoir lu
 * `{error}` — l'événement restait donc intact, citant pour toujours quelqu'un déjà supprimé.
 * Trouvé en rejouant cette même purge sur d'anciens comptes suspendus avant qu'elle n'existe.
 * Quand plus personne n'est invité, l'événement n'a plus de raison d'exister : même geste que
 * supprimer-evenement.ts (best-effort sur l'éventuel événement Google, puis vrai DELETE).
 */
async function retirerDesEvenements(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
  etablissementId: string,
): Promise<void> {
  const [{ data: obligatoires }, { data: optionnels }] = await Promise.all([
    serviceClient
      .from('evenements_admin')
      .select('id, participants_obligatoires, participants_optionnels, google_event_id, cree_par')
      .contains('participants_obligatoires', [profileId]),
    serviceClient
      .from('evenements_admin')
      .select('id, participants_obligatoires, participants_optionnels, google_event_id, cree_par')
      .contains('participants_optionnels', [profileId]),
  ])
  type EvenementAdmin = { id: string; participants_obligatoires: string[]; participants_optionnels: string[]; google_event_id: string | null; cree_par: string | null }
  const evenementParId = new Map<string, EvenementAdmin>()
  for (const e of [...(obligatoires ?? []), ...(optionnels ?? [])]) evenementParId.set(e.id, e)

  for (const evenement of evenementParId.values()) {
    const nouveauxObligatoires = evenement.participants_obligatoires.filter((id) => id !== profileId)
    const nouveauxOptionnels = evenement.participants_optionnels.filter((id) => id !== profileId)

    if (nouveauxObligatoires.length === 0 && nouveauxOptionnels.length === 0) {
      if (evenement.google_event_id) {
        const hote = await integrationHoteReunion(serviceClient, { organisateurId: evenement.cree_par, etablissementId }).catch(() => null)
        if (hote) await supprimerEvenement(hote, evenement.google_event_id).catch(() => {})
      }
      await serviceClient.from('evenements_admin').delete().eq('id', evenement.id)
      continue
    }

    await serviceClient
      .from('evenements_admin')
      .update({ participants_obligatoires: nouveauxObligatoires, participants_optionnels: nouveauxOptionnels })
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

  await retirerDesEvenements(serviceClient, studentId, etablissementId)
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

  await retirerDesEvenements(serviceClient, teacherId, etablissementId)

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

    /* Dossiers, partages ponctuels, messages et lien DUO : identiques pour un étudiant ou un
       professeur (un professeur a lui aussi des dossiers, des partages, des messages — seul le
       lien DUO ne le concerne jamais en pratique, mais le nettoyer reste un no-op inoffensif pour
       lui). Volontairement APRÈS la purge propre au rôle : `purgerDossiersDocuments` dépend de
       `purgerDocuments`, déjà appelée plus haut, qui a vidé les dossiers de leurs fichiers. */
    await purgerDossiersDocuments(serviceClient, body.profileId)
    await purgerPartagesDocuments(serviceClient, body.profileId)
    await purgerMessages(serviceClient, body.profileId)
    await rompreLienDuo(serviceClient, body.profileId)

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
