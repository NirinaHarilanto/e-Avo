/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creerNotification } from './notifications.js'
import { avecPartenairesDuo } from './duo.js'
import { forfaitEntierementConsomme } from '../../src/lib/heures.js'
import { heuresDeLaVague } from '../../src/lib/heuresCollectif.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/* Type de notification invitant l'élève à déposer son avis — demande client du 2026-10-13 :
   « quand un étudiant (DUO, collectif, individuel) finit toutes ses heures de forfait, il sera
   notifié et invité à renseigner un avis sur son parcours pédagogique dans son espace personnel ».
   Exporté : c'est aussi la clé qui empêche de renvoyer l'invitation à chaque séance suivante. */
export const TYPE_NOTIFICATION_AVIS = 'avis_invitation'

/* Heures consommées par un élève DANS SA CLASSE, à défaut dans sa vague, et jamais sur toute la
   vie de son dossier : un élève passé par un parcours individuel avant de rejoindre une vague ne
   doit pas voir celle-ci déclarée terminée d'emblée.

   La portée s'est rétrécie de la vague à la classe le 2026-10-30, avec le déplacement d'élèves
   entre classes (0146) : « quand un étudiant est déplacé dans une autre classe, son compteur
   d'heures suivies repart de 0 ». Les débits de l'ancienne classe restent en base, intacts — ils
   pointent simplement sur des séances d'une AUTRE classe, et ne comptent donc plus dans celle-ci.
   `cohortClassId` à null (vague legacy sans classes, affectation en attente) retombe sur la
   portée vague d'avant, inchangée.

   Le RATTACHEMENT d'une écriture à sa classe n'est pas refait ici : il vit dans
   src/lib/heuresCollectif.ts, avec les autres écrans qui posent la même question. Cette règle y
   a été centralisée le 2026-11-20 après avoir existé en six exemplaires dont cinq faux : tous
   joignaient hour_ledger aux séances par `session_id` seul, et perdaient donc les reprises
   d'antériorité (0140), qui n'ont aucune séance. 21 élèves sur 25 avaient un compteur faux, et
   11 d'entre eux, forfait terminé, passaient pour être à mi-parcours. */
export async function heuresConsommeesDansVague(
  serviceClient: ServiceClient,
  studentId: string,
  cohortId: string,
  cohortClassId?: string | null,
): Promise<number> {
  /* Les séances de la portée demandée : la classe (0146) quand elle est connue, la vague
     entière sinon. */
  const requeteSeances = serviceClient.from('sessions').select('id')
  const { data: seances } = await (cohortClassId
    ? requeteSeances.eq('cohort_class_id', cohortClassId)
    : requeteSeances.eq('cohort_id', cohortId))
  const idsSeances = new Set((seances ?? []).map((s) => s.id))

  /* Et les FORFAITS de la même portée, pour les reprises d'antériorité (0140), qui n'ont
     aucune séance derrière elles. Sans eux, l'essentiel du parcours d'un élève repris à
     l'import disparaît du compteur — voir heuresCollectif.ts pour l'incident du 2026-11-20. */
  const { data: forfaits } = await serviceClient
    .from('packages')
    .select('id, cohort_class_id')
    .eq('student_id', studentId)
    .eq('type_programme', 'collectif')
  let idsForfaits: Set<string>
  if (cohortClassId) {
    idsForfaits = new Set((forfaits ?? []).filter((f) => f.cohort_class_id === cohortClassId).map((f) => f.id))
  } else {
    /* Portée vague : les forfaits rattachés à une de ses classes, plus ceux qui n'en nomment
       aucune — souscrits avant 0146, ils ne peuvent relever que de la vague où l'élève est
       inscrit, et les écarter effacerait l'antériorité des plus anciens dossiers. */
    const { data: classesVague } = await serviceClient.from('cohort_classes').select('id').eq('cohort_id', cohortId)
    const idsClasses = new Set((classesVague ?? []).map((c) => c.id))
    idsForfaits = new Set(
      (forfaits ?? []).filter((f) => f.cohort_class_id == null || idsClasses.has(f.cohort_class_id)).map((f) => f.id),
    )
  }

  if (idsSeances.size === 0 && idsForfaits.size === 0) return 0

  /* Toutes les écritures de l'élève, triées en mémoire : un élève en a quelques dizaines au
     plus, et filtrer en base obligerait à deux requêtes dont l'une sur `session_id is null`. */
  const { data: debits } = await serviceClient
    .from('hour_ledger')
    .select('heures, session_id, package_id')
    .eq('student_id', studentId)
    .eq('type_ecriture', 'debit_etudiant')
  return heuresDeLaVague(debits ?? [], idsSeances, idsForfaits)
}

/* Parcours terminé ? Deux règles, selon le programme — ce sont celles qui existaient déjà côté
   application, reprises à l'identique :
   - en vague, le forfait est celui de la vague (`cohorts.heures_forfait`, à défaut celui de
     l'établissement) et seules les heures de cette vague comptent (lib/classesCollectif.ts) ;
   - sinon, tous les forfaits souscrits se CUMULENT (`lib/heures.ts`, totalHeuresCumulees) : un
     forfait de prolongation s'ajoute au précédent, il ne le remplace pas — sans quoi un élève
     qui vient de prolonger serait déclaré « terminé » à tort.
   Dans les deux cas, un forfait inconnu ou nul ne termine jamais rien : mieux vaut ne rien
   proposer qu'inviter quelqu'un à conclure un parcours qui continue. */
/* Où en est un élève de son parcours : le forfait applicable et les heures déjà consommées
   dessus. Extrait de `parcoursTermine` le 2026-10-19 pour servir aussi aux jalons de mi-parcours
   et de fin de parcours (voir jalonsParcours.ts) — les deux reposent sur ce même calcul, et le
   dupliquer les aurait laissés diverger. `forfait` à `null` signifie « inconnu », jamais zéro. */
export async function mesurerParcours(
  serviceClient: ServiceClient,
  studentId: string,
  cohortId: string | null,
  etablissementId: string,
  /* Classe de niveau au sein de la vague (0146) : les heures se comptent alors dans cette classe
     seule, pour qu'une montée de niveau fasse repartir le compteur de zéro. Omis ou null, la
     portée reste celle de la vague entière, comme avant le 2026-10-30. */
  cohortClassId?: string | null,
): Promise<{ forfait: number | null; consommees: number }> {
  if (cohortId) {
    const { data: vague } = await serviceClient.from('cohorts').select('heures_forfait').eq('id', cohortId).maybeSingle()
    let forfait = vague?.heures_forfait ?? null
    if (forfait == null) {
      const { data: etab } = await serviceClient
        .from('etablissements')
        .select('heures_forfait_collectif')
        .eq('id', etablissementId)
        .maybeSingle()
      forfait = etab?.heures_forfait_collectif ?? null
    }
    if (forfait == null || forfait <= 0) return { forfait: null, consommees: 0 }
    return { forfait, consommees: await heuresConsommeesDansVague(serviceClient, studentId, cohortId, cohortClassId) }
  }

  const [{ data: forfaits }, { data: debits }] = await Promise.all([
    serviceClient.from('packages').select('total_heures').eq('student_id', studentId),
    serviceClient.from('hour_ledger').select('heures').eq('student_id', studentId).eq('type_ecriture', 'debit_etudiant'),
  ])
  const total = (forfaits ?? []).reduce((somme, f) => somme + Number(f.total_heures), 0)
  const consommees = (debits ?? []).reduce((somme, d) => somme + Number(d.heures), 0)
  return { forfait: total > 0 ? total : null, consommees }
}

async function parcoursTermine(
  serviceClient: ServiceClient,
  studentId: string,
  cohortId: string | null,
  etablissementId: string,
  cohortClassId?: string | null,
): Promise<boolean> {
  const { forfait, consommees } = await mesurerParcours(serviceClient, studentId, cohortId, etablissementId, cohortClassId)
  return forfaitEntierementConsomme(consommees, forfait)
}

/* Invite les élèves qui viennent de terminer leur forfait à déposer un avis. Appelé à la clôture
   d'une séance, le seul moment où des heures sont débitées.

   Jamais deux fois : l'invitation n'est envoyée que si la personne n'en a pas déjà reçu une et
   n'a pas déjà déposé d'avis. Sans cette garde, chaque séance clôturée APRÈS la fin du forfait
   (une prolongation, une séance offerte, une vague qui continue) en renverrait une nouvelle.

   Les deux membres d'un binôme DUO sont invités, bien qu'un seul porte le forfait (0054) : ils
   ont suivi le même parcours, chacun a son avis à donner. */
export async function inviterAuxAvisSiForfaitTermine(
  serviceClient: ServiceClient,
  params: { etablissementId: string; cohortId: string | null; cohortClassId?: string | null; studentIds: string[] },
) {
  for (const studentId of params.studentIds) {
    if (!(await parcoursTermine(serviceClient, studentId, params.cohortId, params.etablissementId, params.cohortClassId))) continue

    for (const destinataireId of await avecPartenairesDuo(serviceClient, [studentId])) {
      const [{ data: dejaInvite }, { data: dejaDepose }] = await Promise.all([
        serviceClient
          .from('notifications')
          .select('id')
          .eq('destinataire_profile_id', destinataireId)
          .eq('type', TYPE_NOTIFICATION_AVIS)
          .limit(1)
          .maybeSingle(),
        serviceClient.from('temoignages').select('id').eq('auteur_profile_id', destinataireId).limit(1).maybeSingle(),
      ])
      if (dejaInvite || dejaDepose) continue

      await creerNotification(serviceClient, {
        etablissementId: params.etablissementId,
        destinataireProfileId: destinataireId,
        type: TYPE_NOTIFICATION_AVIS,
        titre: 'Votre parcours arrive à son terme',
        message:
          'Vous avez suivi toutes les heures de votre forfait. Racontez-nous votre expérience : votre avis, une fois relu par l’équipe, pourra figurer parmi les témoignages du site.',
        lien: '/mon-espace/profil',
      })
    }
  }
}
