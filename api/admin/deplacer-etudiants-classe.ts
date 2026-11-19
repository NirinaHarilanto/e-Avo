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
  /* Sort des heures restantes d'un élève à mi-parcours — décision client du 2026-11-19.
     `conserver` : le forfait suivant reprend les heures qui lui restent, rien n'est perdu ni
     revendu. `reinitialiser` : forfait complet, les heures non suivies sont abandonnées.
     Exigé dès qu'au moins un élève déplacé est à mi-parcours (voir plus bas). */
  compteurHeures?: 'conserver' | 'reinitialiser'
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
    /* Le changement de vague N'EST PLUS refusé d'emblée — demande client du 2026-11-19 : « on
       doit pouvoir déplacer l'étudiant dans une classe d'une autre vague également. C'est-à-dire
       que l'admin doit pouvoir choisir la vague ET la classe dans laquelle l'étudiant sera
       déplacé. »

       La règle de fond, elle, ne bouge pas : c'est toujours la base qui tranche (garde-fou 0074,
       assoupli par 0147). Un élève ne quitte sa promotion que s'il n'y a consommé AUCUNE heure,
       ou s'il a terminé son forfait — à mi-parcours il reste retenu, parce que l'ouverture d'un
       forfait neuf dans la vague d'arrivée laisserait derrière lui des heures payées et jamais
       suivies. Le contrôle est seulement REMONTÉ ici, plus bas, pour nommer les élèves concernés
       au lieu de laisser remonter une exception Postgres anonyme sur un lot entier. */

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

    /* Qui est À MI-PARCOURS — ni vierge de toute heure, ni au bout de son forfait. C'est pour
       eux, et pour eux seuls, que le sort des heures restantes se décide (demande client du
       2026-11-19). La question est posée pour TOUT déplacement, dans la même vague comme vers
       une autre : des heures payées et non suivies se perdent aussi bien en changeant de classe
       qu'en changeant de promotion, et le client parle des deux dans la même phrase.

       Les deux fonctions appelées ici sont exactement celles du garde-fou en base (0074, assoupli
       par 0147 puis 0164) : appelées plutôt que réécrites, pour que l'écran et la base ne puissent
       pas diverger. `mesurerParcours` ne conviendrait pas pour cette question-ci — il compte les
       heures de la CLASSE (0146) quand le garde-fou regarde toute la PROMOTION, et un élève déjà
       passé d'une classe à l'autre dans la même vague aurait un compteur de classe à zéro. */
    const aMiParcours: typeof aDeplacer = []
    for (const inscription of aDeplacer) {
      const [{ data: aConsomme }, { data: forfaitTermine }] = await Promise.all([
        serviceClient.rpc('etudiant_a_consomme_heures_promotion', {
          p_student_id: inscription.student_id,
          p_cohort_id: inscription.cohort_id,
        }),
        serviceClient.rpc('forfait_collectif_entierement_consomme', {
          p_student_id: inscription.student_id,
          p_cohort_id: inscription.cohort_id,
          p_cohort_class_id: inscription.cohort_class_id,
        }),
      ])
      if (aConsomme && !forfaitTermine) aMiParcours.push(inscription)
    }

    /* Le choix est EXIGÉ, pas deviné : déplacer un élève à mi-parcours sans l'avoir tranché
       reviendrait à décider à sa place du sort d'heures déjà payées. L'écran le demande
       (DeplacerEtudiantsModale) et la route le réclame aussi — une règle qui touche à l'argent
       ne doit pas dépendre du chemin emprunté pour y arriver. */
    const choixCompteur = body.compteurHeures
    if (aMiParcours.length > 0 && choixCompteur !== 'conserver' && choixCompteur !== 'reinitialiser') {
      /* Les noms, pas les identifiants : c'est l'admin qui lit ce message, et il doit savoir sur
         qui revenir. */
      const { data: profils } = await serviceClient
        .from('profiles')
        .select('id, prenom, nom')
        .in(
          'id',
          aMiParcours.map((i) => i.student_id),
        )
      const noms = (profils ?? []).map((p) => [p.prenom, p.nom].filter(Boolean).join(' ')).filter((n) => n.length > 0)
      const pluriel = noms.length > 1
      return Response.json(
        {
          error: `${noms.join(', ')} n'${pluriel ? 'ont' : 'a'} pas terminé ${pluriel ? 'leur' : 'son'} forfait d'heures : précisez s'il faut conserver ou réinitialiser le compteur avant de déplacer.`,
          choixRequis: true,
          elevesMiParcours: noms,
        },
        { status: 409 },
      )
    }
    const idsMiParcours = new Set(aMiParcours.map((i) => i.student_id))

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

    /* 1. Le forfait en cours est SOLDÉ — et c'est bien la première écriture, avant même de
          déplacer l'inscription. Deux raisons, et la seconde est structurelle :
            — le garde-fou en base (0074, assoupli par 0147 puis 0164) ne laisse quitter une
              promotion que si plus aucun forfait collectif n'y reste ouvert : solder est donc
              littéralement ce qui AUTORISE le déplacement qui suit ;
            — solder, c'est trancher le sort des heures restantes, et ce choix doit être acté
              avant que l'élève ne change de classe, pas après.
          Les heures déjà faites ne bougent jamais : elles restent inscrites aux séances de la
          classe quittée, c'est leur place. */
    const heuresRestantesParEleve = new Map<string, number>()
    /* Le volume du forfait que l'on solde, retenu comme dernier recours pour en ouvrir un
       successeur. Il ne sert que si la vague d'arrivée n'annonce aucun forfait : solder sans
       rouvrir laisserait l'élève SANS forfait du tout, et rien ne le lui dirait — ni à lui, ni à
       l'administration. Avant ce chantier, l'absence de forfait de vague empêchait aussi le
       solde, et les deux manques s'annulaient ; maintenant que le solde est ce qui autorise le
       déplacement (0164), il faut rouvrir explicitement. */
    const totalDuForfaitSolde = new Map<string, number>()
    for (const inscription of aDeplacer) {
      /* Le forfait collectif en cours de CET élève : le plus récent non soldé. Un élève sans
         forfait (cas théorique, le trigger 0071 en crée un à l'inscription) n'a rien à solder. */
      const { data: enCours } = await serviceClient
        .from('packages')
        .select('id, cohort_class_id, total_heures')
        .eq('student_id', inscription.student_id)
        .eq('type_programme', 'collectif')
        .is('clos_le', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!enCours) continue

      const totalSolde = Number(enCours.total_heures)
      if (Number.isFinite(totalSolde) && totalSolde > 0) totalDuForfaitSolde.set(inscription.student_id, totalSolde)

      /* Ce qu'il lui restait, pour le reporter si l'admin a choisi de conserver le compteur.
         Les heures consommées viennent de la règle partagée (`mesurerParcours`), jamais
         recalculées ici — c'est la même question que partout ailleurs, elle doit donner la même
         réponse.

         Le TOTAL, en revanche, est celui du forfait que l'on solde à l'instant, pas celui de la
         vague que `mesurerParcours` renvoie. La nuance se paie cher au deuxième déplacement :
         un élève déjà déplacé une fois en conservant son compteur porte un forfait réduit
         (20 h, mettons) dans une vague qui en vend 32 ; partir du forfait de la vague lui
         rendrait 32 − consommées, soit plus d'heures qu'il n'en a jamais payées. On ne reporte
         que ce qui reste de SON forfait. Le forfait de la vague ne sert que de repli, pour un
         forfait sans total lisible. */
      if (idsMiParcours.has(inscription.student_id) && choixCompteur === 'conserver') {
        const { forfait: forfaitVague, consommees } = await mesurerParcours(
          serviceClient,
          inscription.student_id,
          inscription.cohort_id,
          etablissementId,
          inscription.cohort_class_id,
        )
        const totalDuForfait = Number(enCours.total_heures)
        const total = Number.isFinite(totalDuForfait) && totalDuForfait > 0 ? totalDuForfait : forfaitVague
        const restantes = total != null ? Math.max(0, total - consommees) : 0
        if (restantes > 0) heuresRestantesParEleve.set(inscription.student_id, restantes)
      }

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

    /* 2. L'inscription à la classe — et à la vague, quand l'élève en change. Le forfait venant
          d'être soldé, le garde-fou laisse passer. */
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

    /* 3. Le forfait neuf, ouvert sur la nouvelle classe. Son volume dépend du choix de l'admin
          pour les élèves à mi-parcours :
            — CONSERVER : il reprend les heures qui restaient, et rien n'est facturé — ce n'est
              pas une nouvelle vente, c'est la suite de la même. Le compteur affichera donc
              « 0 h / <ce qui restait> », ce qui est exactement ce que l'élève a encore droit de
              suivre ;
            — RÉINITIALISER : forfait complet de la vague, au tarif correspondant. Les heures non
              suivies du forfait soldé sont abandonnées, et c'est le sens du mot réinitialiser.
          Pour tous les autres (aucune heure suivie, ou forfait déjà terminé), rien ne change :
          forfait complet, comme avant.

          Et si la vague d'arrivée n'annonce aucun forfait, on reprend le volume de celui que
          l'on vient de solder : un élève ne doit jamais sortir d'un déplacement sans forfait,
          puisque c'est lui qui borne ses heures et déclenche sa fin de parcours. */
    let forfaitsOuverts = 0
    for (const inscription of aDeplacer) {
      const restantes = heuresRestantesParEleve.get(inscription.student_id)
      const heuresDuNouveau = restantes ?? heuresForfait ?? totalDuForfaitSolde.get(inscription.student_id) ?? null
      if (heuresDuNouveau == null || heuresDuNouveau <= 0) continue

      const { error: erreurForfait } = await serviceClient.from('packages').insert({
        etablissement_id: etablissementId,
        student_id: inscription.student_id,
        type_programme: 'collectif',
        total_heures: heuresDuNouveau,
        montant: restantes != null ? null : montantForfait,
        cohort_class_id: cible.id,
      })
      if (!erreurForfait) forfaitsOuverts += 1
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
      compteurConserve: heuresRestantesParEleve.size,
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
