/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creerNotification } from './notifications.js'
import { avecPartenairesDuo } from './duo.js'
import { forfaitEntierementConsomme } from '../../src/lib/heures.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/* Type de notification invitant l'élève à déposer son avis — demande client du 2026-10-13 :
   « quand un étudiant (DUO, collectif, individuel) finit toutes ses heures de forfait, il sera
   notifié et invité à renseigner un avis sur son parcours pédagogique dans son espace personnel ».
   Exporté : c'est aussi la clé qui empêche de renvoyer l'invitation à chaque séance suivante. */
export const TYPE_NOTIFICATION_AVIS = 'avis_invitation'

/* Heures consommées par un élève DANS UNE VAGUE précisément, et non sur toute la vie de son
   dossier : un élève passé par un parcours individuel avant de rejoindre une vague ne doit pas
   voir celle-ci déclarée terminée d'emblée. Même jointure manuelle sessions → hour_ledger que la
   fiche candidat collectif (FicheCandidatCollectifModale.tsx) — c'est la même question posée au
   même endroit, elle doit donner la même réponse. */
async function heuresConsommeesDansVague(serviceClient: ServiceClient, studentId: string, cohortId: string): Promise<number> {
  const { data: seances } = await serviceClient.from('sessions').select('id').eq('cohort_id', cohortId)
  const ids = (seances ?? []).map((s) => s.id)
  if (ids.length === 0) return 0
  const { data: debits } = await serviceClient
    .from('hour_ledger')
    .select('heures')
    .eq('student_id', studentId)
    .eq('type_ecriture', 'debit_etudiant')
    .in('session_id', ids)
  return (debits ?? []).reduce((total, d) => total + Number(d.heures), 0)
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
async function parcoursTermine(
  serviceClient: ServiceClient,
  studentId: string,
  cohortId: string | null,
  etablissementId: string,
): Promise<boolean> {
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
    if (forfait == null || forfait <= 0) return false
    return forfaitEntierementConsomme(await heuresConsommeesDansVague(serviceClient, studentId, cohortId), forfait)
  }

  const [{ data: forfaits }, { data: debits }] = await Promise.all([
    serviceClient.from('packages').select('total_heures').eq('student_id', studentId),
    serviceClient.from('hour_ledger').select('heures').eq('student_id', studentId).eq('type_ecriture', 'debit_etudiant'),
  ])
  const total = (forfaits ?? []).reduce((somme, f) => somme + Number(f.total_heures), 0)
  const consommees = (debits ?? []).reduce((somme, d) => somme + Number(d.heures), 0)
  return forfaitEntierementConsomme(consommees, total)
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
  params: { etablissementId: string; cohortId: string | null; studentIds: string[] },
) {
  for (const studentId of params.studentIds) {
    if (!(await parcoursTermine(serviceClient, studentId, params.cohortId, params.etablissementId))) continue

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
