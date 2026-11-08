import { jourDansFuseauEtablissement } from '../../src/lib/etablissement.js'
import { forfaitEntierementConsomme } from '../../src/lib/heures.js'
import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { annulerUneSeance, type SeanceAAnnuler } from '../_lib/annulerSeance.js'
import { mesurerParcours } from '../_lib/finDeForfait.js'
import { formaterDateSeance, notifierAdminsMouvementPlanning, notifierParticipantsSeance } from '../_lib/notifications.js'
import { signalerSynchro } from '../_lib/synchro.js'
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

type ServiceClient = ReturnType<typeof createClient<Database>>
type TypeCours = 'individuel' | 'collectif'

interface Corps {
  studentId?: string
  cible?: TypeCours
  motif?: string
}

interface ForfaitSolde {
  heures: number
  type: string
  reglementATraiter: boolean
}

/**
 * Fait basculer un élève d'un type de cours à l'autre — demande client du 2026-11-08 : « quand un
 * étudiant a complètement fini son forfait de cours ou n'a pas encore commencé une séance de
 * cours, on doit pouvoir changer de type de cours [...] il faut le rendre techniquement possible
 * de faire le basculement sans casser la logique et les mécanismes. »
 *
 * Cette route DÉTACHE, elle ne rattache pas. C'est délibéré : rattacher, c'est choisir une vague
 * et une classe (avec leurs garde-fous de capacité et de changement de promotion, triggers 0071
 * et 0074) ou choisir un forfait, un tarif et un professeur — quatre écrans qui existent déjà et
 * qui savent le faire. Les recopier ici aurait créé un second chemin, condamné à diverger du
 * premier. Une fois le basculement fait, l'élève se retrouve donc exactement dans l'état d'un
 * nouvel élève de son nouveau type, et l'admin enchaîne avec les boutons habituels — « Assigner
 * une vague » ou « Créer un forfait » puis « Affecter un professeur ».
 *
 * Ce que la route prend en charge, parce que l'oublier CASSERAIT quelque chose :
 *   — les séances à venir, qui sinon resteraient debout dans l'agenda Google de tout le monde ;
 *   — l'affectation de professeur, qui sinon continuerait de désigner un professeur sans cours ;
 *   — le forfait en cours, qui sinon s'additionnerait au suivant et gonflerait les heures dues.
 *
 * Pourquoi une route serveur : annuler une séance touche l'agenda Google de l'établissement,
 * hors de portée du navigateur comme de Postgres (même raison qu'api/admin/retirer-professeur.ts).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.studentId || (body.cible !== 'individuel' && body.cible !== 'collectif')) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }
    const cible = body.cible

    const { data: eleve } = await serviceClient
      .from('profiles')
      .select('id, prenom, nom, status, etablissement_id')
      .eq('id', body.studentId)
      .maybeSingle()
    if (!eleve || eleve.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Élève introuvable.' }, { status: 404 })
    }
    if (eleve.status === 'suspended') {
      return Response.json({ error: 'Ce compte a été supprimé.' }, { status: 409 })
    }

    /* Le type ACTUEL se lit à l'inscription en vague, jamais à une colonne de `profiles` : c'est
       la convention de toute l'application depuis 0027 (voir useTypesProgrammeEtudiants.ts). */
    const { data: inscriptionVague } = await serviceClient
      .from('cohort_enrollments')
      .select('id, cohort_id, cohort_class_id')
      .eq('student_id', eleve.id)
      .maybeSingle()
    const typeActuel: TypeCours = inscriptionVague ? 'collectif' : 'individuel'
    if (typeActuel === cible) {
      return Response.json(
        { error: cible === 'collectif' ? 'Cet élève est déjà en cours collectif.' : 'Cet élève n’est pas en cours collectif.' },
        { status: 409 },
      )
    }

    /* Les deux seules portes ouvertes par le client, et elles ont la même raison d'être : tant
       qu'un forfait est en cours, des heures sont dues sur un format de cours précis. Changer de
       format au milieu laisserait un reliquat sans support — ni la vague ni le professeur
       individuel ne saurait quoi en faire. Mesuré par le même calcul que partout ailleurs
       (api/_lib/finDeForfait.ts), jamais refait ici. */
    const { forfait, consommees } = await mesurerParcours(
      serviceClient,
      eleve.id,
      inscriptionVague?.cohort_id ?? null,
      etablissementId,
      inscriptionVague?.cohort_class_id,
    )
    const pasCommence = consommees === 0
    const termine = forfaitEntierementConsomme(consommees, forfait)
    if (!pasCommence && !termine) {
      return Response.json(
        {
          error:
            forfait != null
              ? `Cet élève a déjà suivi ${consommees} h sur ${forfait} h : le changement de type de cours n'est possible qu'avant la première séance, ou une fois le forfait terminé.`
              : `Cet élève a déjà suivi ${consommees} h : le changement de type de cours n'est possible qu'avant la première séance, ou une fois le forfait terminé.`,
        },
        { status: 409 },
      )
    }

    const maintenantIso = new Date().toISOString()
    const { seancesAnnulees, inscriptionsRetirees } = await libererLesSeancesAVenir(
      serviceClient,
      eleve.id,
      profileId,
      etablissementId,
      maintenantIso,
    )

    /* Un forfait entamé puis terminé reste tel quel, heures comprises : elles ont bien été
       suivies, et le forfait suivant s'y ajoutera comme il le fait déjà lors d'une montée de
       classe (0146). Seul un forfait auquel personne n'a touché est supprimé — le garder
       ajouterait des heures jamais consommées au compteur du nouveau parcours. */
    const { soldes: forfaitsSoldes, supprimes: forfaitsSupprimes } = await soliderLesForfaits(
      serviceClient,
      eleve.id,
      cible === 'collectif' ? ['individuel', 'duo'] : ['collectif'],
      pasCommence,
      maintenantIso,
    )

    if (cible === 'collectif') {
      /* `date_fin` est un jour, dans le fuseau de l'établissement et non celui du serveur — même
         précaution qu'api/admin/retirer-professeur.ts (0039). Le `.is('date_fin', null)` rend
         l'écriture idempotente : un second appel ne réécrit pas une clôture déjà posée. */
      const { error } = await serviceClient
        .from('teacher_assignments')
        .update({
          date_fin: jourDansFuseauEtablissement(),
          motif_changement: body.motif?.trim() || 'Passage en cours collectif',
        })
        .eq('student_id', eleve.id)
        .is('date_fin', null)
      if (error) {
        return Response.json({ error: 'La clôture de l’affectation de professeur a échoué.' }, { status: 500 })
      }
    } else {
      const { error } = await serviceClient.from('cohort_enrollments').delete().eq('id', inscriptionVague!.id)
      if (error) {
        return Response.json({ error: 'La sortie de la vague a échoué.' }, { status: 500 })
      }
    }

    /* Une seule notification pour tout le lot, jamais une par séance — même choix que le retrait
       d'un professeur : un élève qui avait dix séances planifiées ne doit pas recevoir dix
       messages, il en manquerait celui qui compte. */
    if (seancesAnnulees.length > 0) {
      const premiere = seancesAnnulees[0]
      const message =
        seancesAnnulees.length > 1
          ? `${seancesAnnulees.length} séances à venir ont été annulées suite à votre changement de type de cours, à partir du ${formaterDateSeance(premiere.debut)}. Elles sont à replanifier.`
          : `La séance du ${formaterDateSeance(premiere.debut)} a été annulée suite à votre changement de type de cours. Elle est à replanifier.`

      await notifierParticipantsSeance(serviceClient, {
        etablissementId,
        sessionId: premiere.id,
        teacherId: premiere.teacher_id,
        acteurId: profileId,
        type: 'seance_annulee',
        titre: seancesAnnulees.length > 1 ? 'Séances annulées' : 'Séance annulée',
        message,
      })
      await notifierAdminsMouvementPlanning(serviceClient, {
        etablissementId,
        acteurId: profileId,
        teacherId: premiere.teacher_id,
        type: 'planning_seance_annulee',
        titre: 'Séances annulées (changement de type de cours)',
        detail: message,
        studentIds: [eleve.id],
      })
    }

    await signalerSynchro(etablissementId)

    return Response.json({
      ok: true,
      typeAvant: typeActuel,
      typeApres: cible,
      seancesAnnulees: seancesAnnulees.length,
      inscriptionsRetirees,
      forfaitsSoldes,
      forfaitsSupprimes,
    })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

/* Détache l'élève de toutes ses séances ENCORE À VENIR, des deux côtés, et selon la règle qui
   convient à chacune :
     — une séance COLLECTIVE appartient à sa classe, pas à l'élève : on retire sa seule
       inscription, jamais la séance, que ses camarades continuent de suivre ;
     — une séance individuelle ou DUO n'existe que pour ses inscrits : on annule la séance quand
       il en était le dernier (agenda Google compris), et on se contente de retirer son
       inscription quand son binôme y reste.
   Une séance passée n'est jamais touchée : ses heures sont déjà comptées. */
async function libererLesSeancesAVenir(
  serviceClient: ServiceClient,
  studentId: string,
  profileId: string,
  etablissementId: string,
  maintenantIso: string,
): Promise<{ seancesAnnulees: SeanceAAnnuler[]; inscriptionsRetirees: number }> {
  const { data: inscriptions } = await serviceClient
    .from('session_enrollments')
    .select('id, session_id, sessions!inner(id, teacher_id, statut, etablissement_id, debut, duree_minutes, type)')
    .eq('student_id', studentId)
    .eq('sessions.statut', 'planifiee')
    .gte('sessions.debut', maintenantIso)

  const seancesAnnulees: SeanceAAnnuler[] = []
  let inscriptionsRetirees = 0

  const lignes = (inscriptions ?? [])
    .map((i) => ({ inscriptionId: i.id, seance: i.sessions as unknown as SeanceAAnnuler & { type: string } }))
    .filter((l) => Boolean(l.seance))
    .sort((a, b) => a.seance.debut.localeCompare(b.seance.debut))

  for (const { inscriptionId, seance } of lignes) {
    if (seance.type === 'collectif') {
      await serviceClient.from('session_enrollments').delete().eq('id', inscriptionId)
      inscriptionsRetirees++
      continue
    }

    const { count } = await serviceClient
      .from('session_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', seance.id)
    if ((count ?? 1) > 1) {
      // Binôme DUO : la séance reste debout pour l'autre membre.
      await serviceClient.from('session_enrollments').delete().eq('id', inscriptionId)
      inscriptionsRetirees++
      continue
    }

    /* L'inscription est conservée sur une séance annulée, comme le fait déjà le retrait d'un
       professeur : c'est elle qui dit pour qui cette séance avait été posée, et c'est elle que
       lit la notification envoyée juste après. */
    await annulerUneSeance(serviceClient, seance, profileId, etablissementId, true)
    seancesAnnulees.push(seance)
  }

  return { seancesAnnulees, inscriptionsRetirees }
}

/* Clôt les forfaits du type qu'on quitte. Supprimé plutôt que soldé quand l'élève n'a RIEN
   consommé et qu'aucun règlement ne s'y rattache : `clos_le` est une annotation d'historique
   (0146), il ne retire pas les heures du total affiché — un forfait individuel de 20 h jamais
   entamé s'ajouterait donc aux 32 h de la vague et en annoncerait 52.
 *
 * Le décompte des règlements ignore volontairement `supprime_le` : un paiement supprimé est un
 * soft-delete, sa ligne existe toujours et sa clé étrangère retient le forfait — le DELETE
 * échouerait sur une erreur Postgres brute. L'état « réglé » affiché à l'admin, lui, ne compte
 * que les règlements actifs. */
async function soliderLesForfaits(
  serviceClient: ServiceClient,
  studentId: string,
  types: ('individuel' | 'duo' | 'collectif')[],
  pasCommence: boolean,
  maintenantIso: string,
): Promise<{ soldes: ForfaitSolde[]; supprimes: number }> {
  const { data: forfaits } = await serviceClient
    .from('packages')
    .select('id, total_heures, type_programme')
    .eq('student_id', studentId)
    .is('clos_le', null)
    .in('type_programme', types)

  const soldes: ForfaitSolde[] = []
  let supprimes = 0

  for (const forfait of forfaits ?? []) {
    const [{ count: reglements }, { count: reglementsActifs }, { count: reprises }] = await Promise.all([
      serviceClient.from('student_payments').select('id', { count: 'exact', head: true }).eq('package_id', forfait.id),
      serviceClient
        .from('student_payments')
        .select('id', { count: 'exact', head: true })
        .eq('package_id', forfait.id)
        .is('supprime_le', null),
      serviceClient.from('hour_ledger').select('id', { count: 'exact', head: true }).eq('package_id', forfait.id),
    ])

    if (pasCommence && !reglements && !reprises) {
      const { error } = await serviceClient.from('packages').delete().eq('id', forfait.id)
      if (!error) {
        supprimes++
        continue
      }
      // Une référence encore inconnue (une demande de forfait, par exemple) : on solde au lieu
      // d'échouer — le basculement lui-même n'a aucune raison d'être bloqué par cette ligne.
    }

    await serviceClient.from('packages').update({ clos_le: maintenantIso }).eq('id', forfait.id)
    soldes.push({
      heures: Number(forfait.total_heures),
      type: forfait.type_programme,
      reglementATraiter: (reglementsActifs ?? 0) > 0 && pasCommence,
    })
  }

  return { soldes, supprimes }
}
