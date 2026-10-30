import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { formaterDateSeance, notifierAdminsMouvementPlanning } from '../_lib/notifications.js'
import { synchroniserInvitesVisio } from '../_lib/synchroniserVisio.js'
import { signalerSynchro } from '../_lib/synchro.js'
import { mesurerParcours } from '../_lib/finDeForfait.js'
import { forfaitEntierementConsomme } from '../../src/lib/heures.js'

export const config = { runtime: 'edge' }

/* Plafond d'une classe de niveau, posé en base par le trigger `verifier_capacite_classe` (0074,
   règle client des 3 à 7 apprenants). Repris ici pour refuser le déplacement AVANT d'avoir
   commencé à déplacer quoi que ce soit : le trigger, lui, s'arrête sur le premier élève en trop
   et laisse les précédents déjà déplacés, avec un message d'erreur Postgres brut à l'écran. */
const CAPACITE_MAX_CLASSE = 7

interface Corps {
  classeSourceId?: string
  classeCibleId?: string
  studentIds?: string[]
}

/**
 * Déplace un ou plusieurs élèves d'une classe de cours collectif vers une autre — demande client
 * du 2026-10-30 : « pour chaque classe, rajoute un bouton "Déplacer un étudiant" [...] cette
 * fonctionnalité permet de faire passer un ou plusieurs étudiants à une classe supérieure [...]
 * toutes les informations des étudiants impactés par le déplacement se mettront à jour
 * automatiquement [...] son compteur d'heures suivies repart de 0 ».
 *
 * En route serveur plutôt qu'en `supabase.from(...).update()` depuis l'écran, comme
 * ChangerClasseEtudiant.tsx le faisait pour un élève seul : un déplacement n'est pas une
 * écriture, c'en est cinq, et trois d'entre elles sont hors de portée du navigateur —
 * ouvrir un forfait, désinscrire des séances déjà planifiées, et mettre à jour les invitations
 * des réunions Google correspondantes.
 *
 * Ce qui bouge, et pourquoi :
 *
 * 1. L'INSCRIPTION (`cohort_enrollments.cohort_class_id`). Tout le reste de l'application lit la
 *    classe ici : niveau affiché sur la fiche de l'élève, professeur principal et secondaires,
 *    période de cours, effectifs des deux classes. Rien d'autre n'est à recopier.
 *
 * 2. LE COMPTEUR D'HEURES. Rien à faire, et c'est voulu : les heures d'un élève collectif se
 *    comptent dans SA CLASSE depuis 0146 (voir le commentaire de cette migration). Les débits de
 *    l'ancienne classe restent en base, rattachés à ses séances — la nouvelle classe n'en a
 *    aucun, son compteur vaut zéro de lui-même. Aucune écriture du grand livre n'est touchée :
 *    l'historique des heures, la rémunération des professeurs et le parcours pédagogique
 *    restent intégralement lisibles.
 *
 * 3. LE FORFAIT. Décision client du 2026-10-30 : monter de niveau ouvre un nouveau cycle. Le
 *    forfait en cours est SOLDÉ (`clos_le`), jamais réécrit — il a un reçu derrière lui — et un
 *    nouveau forfait du même nombre d'heures est ouvert sur la nouvelle classe, avec le montant
 *    de la grille tarifaire quand elle en donne un, à encaisser comme n'importe quel forfait.
 *
 * 4. LE PLANNING. L'élève est retiré des séances ENCORE À VENIR de son ancienne classe et
 *    inscrit à celles déjà posées dans la nouvelle. Les séances passées ne bougent pas : elles
 *    ont eu lieu, leurs heures sont décomptées, leur compte rendu est écrit.
 *
 * 5. LES INVITATIONS VISIO. Best effort, comme partout : une séance collective se tient sur un
 *    salon Jitsi partagé qui n'a pas de liste d'invités, mais une séance adossée à un événement
 *    Google en a une, et elle doit suivre.
 *
 * DEUX GESTES, pas un seul, selon que `classeSourceId` est fourni ou non :
 *
 * - DÉPLACER (classe de départ fournie) — demande du 2026-10-30, bouton « Déplacer un étudiant »
 *   d'une ligne de classe. Aucune condition sur le forfait : c'est le geste de faire passer un
 *   élève à la classe supérieure, en cours de parcours s'il le faut. La classe d'arrivée doit
 *   être dans la MÊME vague, sans quoi le garde-fou de changement de promotion (0074) refuserait
 *   l'écriture et le forfait de vague ne serait plus le même.
 *
 * - AJOUTER (pas de classe de départ) — demande du 2026-10-30, zone de recherche d'étudiants du
 *   formulaire « Nouvelle classe » : « à condition que l'étudiant ait déjà consommé toutes ses
 *   heures de forfait ET que l'étudiant soit déjà inscrit en cours collectif ». Ces deux
 *   conditions sont revérifiées ICI, jamais seulement à l'écran. La vague peut changer : ces
 *   élèves viennent justement d'une promotion qu'ils ont terminée, et 0147 lève le garde-fou
 *   pour ce seul cas.
 *
 * Un refus commun aux deux : une classe cible déjà pleine (7 élèves, 0074).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps

    const studentIds = [...new Set(body.studentIds ?? [])]
    if (!body.classeCibleId || studentIds.length === 0) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }
    if (body.classeSourceId && body.classeSourceId === body.classeCibleId) {
      return Response.json({ error: 'La classe de destination est celle de départ.' }, { status: 400 })
    }
    const modeAjout = !body.classeSourceId

    const { data: classes } = await serviceClient
      .from('cohort_classes')
      .select('id, cohort_id, etablissement_id, teacher_id')
      .in('id', [body.classeCibleId, body.classeSourceId ?? body.classeCibleId])

    const source = modeAjout ? null : ((classes ?? []).find((c) => c.id === body.classeSourceId) ?? null)
    const cible = (classes ?? []).find((c) => c.id === body.classeCibleId)
    if (!cible || cible.etablissement_id !== etablissementId || (!modeAjout && (!source || source.etablissement_id !== etablissementId))) {
      return Response.json({ error: 'Classe introuvable.' }, { status: 404 })
    }
    if (source && source.cohort_id !== cible.cohort_id) {
      return Response.json(
        { error: "La classe de destination appartient à une autre vague. Un élève ne change pas de vague une fois ses heures entamées." },
        { status: 409 },
      )
    }

    /* Les inscriptions réellement concernées, relues en base plutôt que crues sur parole : la
       liste envoyée par l'écran peut avoir vieilli (un autre admin a déplacé le même élève) et
       un identifiant d'élève d'une autre classe ne doit pas passer par cette route.
       En mode AJOUT, l'absence de ligne ici EST le refus : « à condition que l'étudiant soit
       déjà inscrit en cours collectif » — un élève individuel n'en a aucune. */
    const requeteInscriptions = serviceClient
      .from('cohort_enrollments')
      .select('id, student_id, cohort_id, cohort_class_id')
      .in('student_id', studentIds)
    const { data: inscriptions } = await (source ? requeteInscriptions.eq('cohort_class_id', source.id) : requeteInscriptions)

    let aDeplacer = inscriptions ?? []
    if (aDeplacer.length === 0) {
      return Response.json(
        {
          error: modeAjout
            ? "Aucun de ces élèves n'est inscrit en cours collectif."
            : "Aucun de ces élèves n'est inscrit dans cette classe.",
        },
        { status: 409 },
      )
    }
    // Déjà dans la classe d'arrivée : rien à faire pour eux, et les compter remplirait la classe
    // à tort dans le contrôle de capacité ci-dessous.
    aDeplacer = aDeplacer.filter((i) => i.cohort_class_id !== cible.id)
    if (aDeplacer.length === 0) {
      return Response.json({ error: 'Ces élèves sont déjà dans cette classe.' }, { status: 409 })
    }

    /* La condition posée par le client pour rejoindre une NOUVELLE classe : avoir consommé tout
       son forfait. Mesurée avec la règle partagée (`mesurerParcours` + `forfaitEntierementConsomme`),
       jamais recalculée ici : l'écran de création de classe filtre déjà sur elle, la base la
       reposera au changement de vague (0147), les trois doivent répondre la même chose.
       Volontairement absente du mode DÉPLACER : y faire passer un élève à la classe supérieure
       n'attend pas qu'il ait épuisé ses heures, le client n'a posé aucune condition. */
    if (modeAjout) {
      const refuses: string[] = []
      for (const inscription of aDeplacer) {
        const { forfait, consommees } = await mesurerParcours(
          serviceClient,
          inscription.student_id,
          inscription.cohort_id,
          etablissementId,
          inscription.cohort_class_id,
        )
        if (!forfaitEntierementConsomme(consommees, forfait)) refuses.push(inscription.student_id)
      }
      if (refuses.length > 0) {
        return Response.json(
          {
            error: `${refuses.length} élève${refuses.length > 1 ? 's n’ont' : " n’a"} pas encore consommé toutes les heures de son forfait : ${refuses.length > 1 ? 'ils ne peuvent' : 'il ne peut'} pas rejoindre une nouvelle classe.`,
          },
          { status: 409 },
        )
      }
    }

    const { count: effectifCible } = await serviceClient
      .from('cohort_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_class_id', cible.id)

    if ((effectifCible ?? 0) + aDeplacer.length > CAPACITE_MAX_CLASSE) {
      const place = Math.max(0, CAPACITE_MAX_CLASSE - (effectifCible ?? 0))
      return Response.json(
        {
          error:
            place === 0
              ? `La classe de destination compte déjà ${CAPACITE_MAX_CLASSE} élèves, le maximum autorisé. Créez une seconde classe de ce niveau.`
              : `La classe de destination ne peut accueillir que ${place} élève${place > 1 ? 's' : ''} de plus (maximum ${CAPACITE_MAX_CLASSE}).`,
        },
        { status: 409 },
      )
    }

    /* Le forfait de la vague, pour ouvrir le nouveau cycle avec le même nombre d'heures que
       l'actuel — même cascade que le trigger 0071 : la vague d'abord, l'établissement à défaut. */
    const [{ data: vague }, { data: etablissement }] = await Promise.all([
      serviceClient.from('cohorts').select('heures_forfait').eq('id', cible.cohort_id).maybeSingle(),
      serviceClient.from('etablissements').select('heures_forfait_collectif').eq('id', etablissementId).maybeSingle(),
    ])
    const heuresForfait = vague?.heures_forfait ?? etablissement?.heures_forfait_collectif ?? null

    /* Montant repris de la grille tarifaire quand elle décrit exactement ce forfait, comme le
       fait déjà CreerForfait.tsx : l'admin voit ce qu'il y a à encaisser sans avoir à le
       ressaisir. Pas de tarif correspondant, pas de montant inventé — il restera à renseigner. */
    const { data: tarifs } = await serviceClient
      .from('tarifs')
      .select('prix, heures')
      .eq('etablissement_id', etablissementId)
      .eq('type_programme', 'collectif')
    const montantForfait = heuresForfait != null ? ((tarifs ?? []).find((t) => t.heures === heuresForfait)?.prix ?? null) : null

    const maintenant = new Date().toISOString()
    /* Les classes QUITTÉES : une seule en mode déplacement, autant que d'élèves en mode ajout —
       ils viennent chacun de la classe où leur parcours précédent s'est achevé. Un élève sans
       classe (vague legacy) n'en quitte aucune. */
    const classesQuittees = [
      ...new Set(aDeplacer.map((i) => i.cohort_class_id).filter((id): id is string => !!id && id !== cible.id)),
    ]
    const [{ data: seancesSource }, { data: seancesCible }] = await Promise.all([
      classesQuittees.length > 0
        ? serviceClient
            .from('sessions')
            .select('id, debut')
            .in('cohort_class_id', classesQuittees)
            .eq('statut', 'planifiee')
            .gte('debut', maintenant)
        : Promise.resolve({ data: [] as { id: string; debut: string }[] }),
      serviceClient
        .from('sessions')
        .select('id, debut')
        .eq('cohort_class_id', cible.id)
        .eq('statut', 'planifiee')
        .gte('debut', maintenant),
    ])
    const idsSeancesSource = (seancesSource ?? []).map((s) => s.id)
    const idsSeancesCible = (seancesCible ?? []).map((s) => s.id)
    const idsDeplaces = aDeplacer.map((i) => i.student_id)

    /* 1. L'inscription à la classe — et à la vague, quand l'élève en change. Le garde-fou 0074
          refuserait l'écriture si son forfait n'était pas terminé ; il l'est, c'est la condition
          vérifiée plus haut, et 0147 lève le garde-fou pour exactement ce cas. */
    const { error: erreurClasse } = await serviceClient
      .from('cohort_enrollments')
      .update({ cohort_class_id: cible.id, cohort_id: cible.cohort_id })
      .in(
        'id',
        aDeplacer.map((i) => i.id),
      )
    if (erreurClasse) {
      return Response.json({ error: erreurClasse.message }, { status: 409 })
    }

    // 3. Le forfait : l'actuel soldé, un neuf ouvert sur la nouvelle classe.
    let forfaitsOuverts = 0
    if (heuresForfait != null && heuresForfait > 0) {
      for (const inscription of aDeplacer) {
        /* Le forfait collectif en cours de CET élève : le plus récent non soldé. Un élève sans
           forfait (cas théorique, le trigger 0071 en crée un à l'inscription) en reçoit un ici
           quand même — c'est le cycle qu'il commence. */
        const { data: enCours } = await serviceClient
          .from('packages')
          .select('id, cohort_class_id')
          .eq('student_id', inscription.student_id)
          .eq('type_programme', 'collectif')
          .is('clos_le', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (enCours) {
          await serviceClient
            .from('packages')
            .update({
              clos_le: maintenant,
              // Un forfait d'avant 0146 peut ne pas savoir quelle classe il couvrait : c'est
              // celle qu'on quitte, et il faut le figer avant de le solder, sinon les heures
              // reprises à la mise en service (0140) qu'il porte se retrouveraient orphelines.
              cohort_class_id: enCours.cohort_class_id ?? inscription.cohort_class_id,
            })
            .eq('id', enCours.id)
        }

        const { error: erreurForfait } = await serviceClient.from('packages').insert({
          etablissement_id: etablissementId,
          student_id: inscription.student_id,
          type_programme: 'collectif',
          total_heures: heuresForfait,
          montant: montantForfait,
          cohort_class_id: cible.id,
        })
        if (!erreurForfait) forfaitsOuverts += 1
      }
    }

    // 4. Le planning : sorti des séances à venir de l'ancienne classe, inscrit à celles de la
    //    nouvelle. Les séances déjà passées ne bougent pas.
    if (idsSeancesSource.length > 0) {
      await serviceClient.from('session_enrollments').delete().in('session_id', idsSeancesSource).in('student_id', idsDeplaces)
    }

    let inscriptionsPosees = 0
    if (idsSeancesCible.length > 0) {
      /* Les inscriptions déjà présentes sont relues avant d'insérer : `session_enrollments` n'a
         pas de contrainte d'unicité (0009), un élève déjà convié à une séance de la classe cible
         y figurerait deux fois et compterait double à la clôture. */
      const { data: dejaInscrits } = await serviceClient
        .from('session_enrollments')
        .select('session_id, student_id')
        .in('session_id', idsSeancesCible)
        .in('student_id', idsDeplaces)
      const existantes = new Set((dejaInscrits ?? []).map((e) => `${e.session_id}|${e.student_id}`))

      const aInserer = idsSeancesCible.flatMap((sessionId) =>
        idsDeplaces
          .filter((studentId) => !existantes.has(`${sessionId}|${studentId}`))
          .map((studentId) => ({
            session_id: sessionId,
            student_id: studentId,
            /* Nul, comme pour toute séance de classe : un élève collectif n'a pas
               d'affectation individuelle (`teacher_assignments`), il est rattaché par sa
               classe — voir creerSeance.ts et seancesHorsAffectation(). */
            teacher_assignment_id: null,
            invitation_statut: 'en_attente' as const,
          })),
      )
      if (aInserer.length > 0) {
        const { error: erreurInscription } = await serviceClient.from('session_enrollments').insert(aInserer)
        if (!erreurInscription) inscriptionsPosees = aInserer.length
      }

      // 5. Les invitations des réunions Google suivent la nouvelle composition. Jamais bloquant.
      for (const sessionId of idsSeancesCible) {
        try {
          await synchroniserInvitesVisio(serviceClient, { sessionId, etablissementId })
        } catch {
          // Silencieux : un incident Google ne doit pas faire échouer un déplacement déjà écrit.
        }
      }
    }
    for (const sessionId of idsSeancesSource) {
      try {
        await synchroniserInvitesVisio(serviceClient, { sessionId, etablissementId })
      } catch {
        // Idem.
      }
    }

    /* Une seule notification pour tout le lot, jamais une par élève ni une par séance — même
       choix qu'au retrait d'un professeur de classe (retirer-professeur-classe.ts). Adressée aux
       admins : c'est un mouvement de planning, pas une décision à annoncer aux élèves, et le
       client n'a pas demandé à les prévenir. */
    if (cible.teacher_id) {
      const premiere = (seancesCible ?? []).sort((a, b) => a.debut.localeCompare(b.debut))[0]
      await notifierAdminsMouvementPlanning(serviceClient, {
        etablissementId,
        acteurId: profileId,
        teacherId: cible.teacher_id,
        type: 'planning_seance_creee',
        titre: aDeplacer.length > 1 ? 'Élèves déplacés vers une autre classe' : 'Élève déplacé vers une autre classe',
        detail:
          `${aDeplacer.length} élève${aDeplacer.length > 1 ? 's ont' : ' a'} rejoint cette classe. ` +
          (premiere
            ? `${aDeplacer.length > 1 ? 'Ils sont inscrits' : 'Il est inscrit'} aux séances déjà planifiées, à partir du ${formaterDateSeance(premiere.debut)}.`
            : "Aucune séance n'est encore planifiée pour cette classe."),
        studentIds: idsDeplaces,
      })
    }

    await signalerSynchro(etablissementId)

    return Response.json({
      ok: true,
      deplaces: aDeplacer.length,
      forfaitsOuverts,
      seancesQuittees: idsSeancesSource.length,
      seancesRejointes: inscriptionsPosees,
    })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
