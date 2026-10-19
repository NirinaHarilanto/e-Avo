/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { jalonsAtteints, LIBELLE_JALON } from '../../src/lib/jalonsParcours.js'
import { formaterHeures } from '../../src/lib/heures.js'
import { creerNotification } from './notifications.js'
import { avecPartenairesDuo } from './duo.js'
import { mesurerParcours } from './finDeForfait.js'
import { adminsDeLEtablissement } from './reservation.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Pose les jalons de parcours que les élèves viennent d'atteindre — demandes client 5 et 8 du
 * 2026-10-19. Appelé à la clôture d'une séance, le seul instant où des heures sont débitées et
 * donc où un seuil peut être franchi (même déclencheur que
 * `inviterAuxAvisSiForfaitTermine`, 0128).
 *
 * Une ligne de `jalons_parcours` (0130) sert deux choses d'un coup :
 *   - l'admin est notifié qu'un suivi pédagogique est à mener avec cet élève (demande 5) ;
 *   - l'élève est invité à remplir son enquête de satisfaction (demande 8), que l'admin et le
 *     professeur concerné relisent ensuite.
 *
 * Jamais deux fois le même jalon : `jalons_parcours_unique` porte sur
 * (student_id, jalon, total_heures_reference). Le total y entre à dessein — un élève qui
 * prolonge son forfait de 20 à 40 h déplace la moitié de son parcours, et doit donc recevoir un
 * nouveau jalon de mi-parcours. L'insertion ignore simplement le doublon (`upsert` sans mise à
 * jour) plutôt que de relire d'abord : deux clôtures simultanées ne peuvent pas créer deux
 * enquêtes pour le même jalon.
 *
 * Les deux membres d'un binôme DUO reçoivent chacun leur jalon, bien qu'un seul porte le forfait
 * (0054) : ils ont suivi le même parcours, chacun a son avis à donner — exactement le choix déjà
 * fait pour l'invitation aux avis.
 */
export async function poserJalonsDeParcours(
  serviceClient: ServiceClient,
  params: { etablissementId: string; cohortId: string | null; studentIds: string[] },
) {
  const admins = await adminsDeLEtablissement(serviceClient, params.etablissementId)

  for (const studentId of params.studentIds) {
    const { forfait, consommees } = await mesurerParcours(serviceClient, studentId, params.cohortId, params.etablissementId)
    const atteints = jalonsAtteints(consommees, forfait)
    if (atteints.length === 0 || forfait == null) continue

    /* Professeur attitré au moment du franchissement, figé sur la ligne : c'est lui que l'enquête
       évalue, et c'est avec lui que le suivi pédagogique se mène. */
    const { data: affectation } = await serviceClient
      .from('teacher_assignments')
      .select('teacher_id')
      .eq('student_id', studentId)
      .is('date_fin', null)
      .maybeSingle()

    for (const membreId of await avecPartenairesDuo(serviceClient, [studentId])) {
      const { data: profil } = await serviceClient.from('profiles').select('prenom, nom').eq('id', membreId).maybeSingle()
      const nomEleve = [profil?.prenom, profil?.nom].filter(Boolean).join(' ') || 'Un étudiant'

      for (const jalon of atteints) {
        const { data: pose } = await serviceClient
          .from('jalons_parcours')
          .upsert(
            {
              etablissement_id: params.etablissementId,
              student_id: membreId,
              jalon,
              total_heures_reference: forfait,
              heures_consommees_au_declenchement: consommees,
              teacher_id: affectation?.teacher_id ?? null,
            },
            { onConflict: 'student_id,jalon,total_heures_reference', ignoreDuplicates: true },
          )
          .select('id')
          .maybeSingle()

        /* Rien en retour = le jalon existait déjà (`ignoreDuplicates`) : ni notification ni
           enquête à reposer, sinon chaque séance suivante en renverrait une. */
        if (!pose) continue

        /* Demande 5 : l'admin doit savoir qu'un suivi pédagogique est à mener ET un rendez-vous à
           lancer avec l'élève. Le lien ouvre son dossier, d'où l'agenda est accessible. */
        for (const adminId of admins) {
          await creerNotification(serviceClient, {
            etablissementId: params.etablissementId,
            destinataireProfileId: adminId,
            type: 'suivi_pedagogique',
            titre: `Suivi pédagogique à mener — ${nomEleve}`,
            message: `${LIBELLE_JALON[jalon]} atteint : ${formaterHeures(consommees)} sur ${formaterHeures(forfait)}. Planifiez un point avec ${nomEleve} et son formateur.`,
            lien: `/admin/etudiants/${membreId}`,
          })
        }

        /* Demande 8 : l'élève remplit son enquête depuis son espace. La pop-up s'ouvre d'elle-même
           à sa prochaine connexion (EnqueteParcoursAuto.tsx) ; la notification est ce qui lui
           permet d'y revenir s'il la referme. */
        await creerNotification(serviceClient, {
          etablissementId: params.etablissementId,
          destinataireProfileId: membreId,
          type: 'enquete_parcours',
          titre: 'Votre avis sur votre parcours',
          message: `${LIBELLE_JALON[jalon]} : dites-nous comment se passent vos cours. Quelques secondes suffisent.`,
          lien: '/mon-espace',
        })
      }
    }
  }
}
