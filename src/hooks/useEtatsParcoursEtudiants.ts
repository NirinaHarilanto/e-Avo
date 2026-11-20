import { supabase } from '../lib/supabaseClient'
import { forfaitEntierementConsomme } from '../lib/heures'
import { useCacheRequete } from './useCacheRequete'
import { selectionParLots } from '../lib/requetesParLots'

export interface EtatParcoursEtudiant {
  /* Toutes les heures souscrites sont consommées. `false` aussi quand aucun forfait n'est connu —
     un parcours qui n'a pas commencé n'est pas un parcours épuisé (voir
     `forfaitEntierementConsomme`). */
  forfaitEpuise: boolean
  /* Aucune séance à venir au planning. C'est l'alerte de la demande 6 (2026-10-19) : un élève
     inscrit, avec un professeur, mais dont rien n'est programmé. */
  sansCoursPlanifie: boolean
  /* Chiffres bruts, exposés depuis le 2026-10-20 pour l'écran Heures & forfaits (demande client :
     « heures suivies / forfait d'heures en cours » sur chaque ligne) — mêmes nombres que ceux qui
     décident `forfaitEpuise` ci-dessus et les jalons de mi-parcours/fin de parcours
     (lib/jalonsParcours.ts), jamais une variante recalculée ailleurs avec une autre portée. Pour
     un élève en vague, `consommees` ne compte que les heures DANS SA CLASSE (à défaut dans sa
     vague), pas le cumul de toute sa vie de dossier (voir le commentaire de la fonction). */
  forfait: number | null
  consommees: number
}

/* État du parcours de TOUS les étudiants de la liste admin, en une passe — demandes client 6 et 7
   du 2026-10-19 : l'étiquette d'avertissement « aucun cours planifié » et la redéfinition des
   statuts actif/inactif ont besoin des mêmes données, pour toute la liste à la fois. Un hook par
   étudiant aurait multiplié les requêtes par le nombre de lignes affichées.

   Deux règles de forfait, reprises telles quelles de celles qui existent déjà côté serveur
   (api/_lib/finDeForfait.ts) pour que l'écran et les relances automatiques ne puissent pas dire
   deux choses différentes :
   - en vague, le forfait est celui de la vague (à défaut celui de l'établissement) et seules les
     heures consommées DANS SA CLASSE comptent — à défaut de classe, dans sa vague (0146) ;
   - sinon, tous les forfaits souscrits se cumulent (une prolongation s'ajoute, elle ne remplace
     pas) et toutes les heures consommées comptent.

   Jointures faites à la main plutôt qu'en `select` imbriqué, comme partout ailleurs dans ce
   projet : les types générés ne déclarent aucune relation (`Relationships: []`), une jointure
   imbriquée n'y serait donc pas typée.

   Un binôme DUO : le dossier, le forfait et les séances vivent sur la principale (0054), c'est
   donc son état qui est calculé — la liste admin n'affiche de toute façon qu'un bloc par binôme. */
export function useEtatsParcoursEtudiants(studentIds: string[]) {
  const cle = studentIds.length > 0 ? `etats-parcours-${[...studentIds].sort().join(',')}` : null

  const { valeur, loading, recharger } = useCacheRequete(cle, async (): Promise<Record<string, EtatParcoursEtudiant>> => {
    const maintenant = new Date().toISOString()

    const [{ data: forfaits }, { data: resumes }, { data: inscriptionsVague }, { data: seancesAVenir }] = await Promise.all([
      /* `id` et `cohort_class_id` en plus du total : ils rattachent les reprises d'antériorité
         (0140) à leur classe, ces écritures n'ayant aucune séance derrière elles. */
      supabase.from('packages').select('id, student_id, total_heures, cohort_class_id, type_programme').in('student_id', studentIds),
      supabase.from('student_hours_summary').select('student_id, heures_consommees').in('student_id', studentIds),
      supabase.from('cohort_enrollments').select('student_id, cohort_id, cohort_class_id').in('student_id', studentIds),
      /* Seules les séances encore « planifiée » comptent comme un cours à venir : une séance
         annulée n'aura pas lieu, une séance terminée a déjà eu lieu. */
      supabase.from('sessions').select('id').eq('statut', 'planifiee').gte('debut', maintenant),
    ])

    const idsSeancesAVenir = (seancesAVenir ?? []).map((s) => s.id)
    /* Par lots (lib/requetesParLots.ts) : les séances à venir de TOUS les élèves, qui peuvent se
       compter par milliers dès que quelques plannings prévisionnels sont posés (jusqu'à 156
       séances par élève) — un `.in()` d'un seul tenant dépasserait la longueur d'URL acceptée, et
       chaque élève passerait à tort en « aucun cours planifié ». */
    const { data: inscriptionsSeances } = await selectionParLots<{ student_id: string }>(idsSeancesAVenir, (lot) =>
      supabase.from('session_enrollments').select('student_id').in('student_id', studentIds).in('session_id', lot),
    )
    const avecCoursAVenir = new Set((inscriptionsSeances ?? []).map((i) => i.student_id))

    const cohortIds = [...new Set((inscriptionsVague ?? []).map((i) => i.cohort_id))]
    const [{ data: vagues }, { data: etablissements }] = await Promise.all([
      cohortIds.length > 0
        ? supabase.from('cohorts').select('id, heures_forfait').in('id', cohortIds)
        : Promise.resolve({ data: [] as { id: string; heures_forfait: number | null }[] }),
      supabase.from('etablissements').select('id, heures_forfait_collectif'),
    ])
    /* Mono-établissement depuis le 2026-09-15 (voir src/lib/etablissement.ts) : la première ligne
       lisible est la bonne, et la RLS n'en rend de toute façon qu'une à cet admin. */
    const forfaitCollectifDefaut = (etablissements ?? [])[0]?.heures_forfait_collectif ?? null
    const forfaitParVague = new Map((vagues ?? []).map((v) => [v.id, v.heures_forfait]))
    const vagueParEtudiant = new Map((inscriptionsVague ?? []).map((i) => [i.student_id, i.cohort_id]))
    /* La CLASSE prime sur la vague depuis le 2026-10-30 (0146, déplacement d'un élève vers une
       classe supérieure) : son compteur d'heures repart de zéro dans sa nouvelle classe, les
       heures faites dans la précédente restent en base mais appartiennent à une autre classe.
       Un élève sans classe (vague legacy, affectation en attente) garde la portée vague. */
    const classeParEtudiant = new Map(
      (inscriptionsVague ?? []).filter((i) => i.cohort_class_id).map((i) => [i.student_id, i.cohort_class_id as string]),
    )

    /* Heures consommées dans une classe (à défaut dans une vague) : il faut les débits rattachés
       aux séances de CELLE-CI, pas le total de la vie du dossier — un élève passé par un parcours
       individuel avant de rejoindre une vague verrait sinon celle-ci déclarée terminée d'emblée
       (même précaution que `heuresConsommeesDansVague`, api/_lib/finDeForfait.ts). */
    const etudiantsEnVague = [...vagueParEtudiant.keys()]
    const { data: seancesDesVagues } = cohortIds.length > 0 && etudiantsEnVague.length > 0
      ? await supabase.from('sessions').select('id, cohort_id, cohort_class_id').in('cohort_id', cohortIds)
      : { data: [] as { id: string; cohort_id: string | null; cohort_class_id: string | null }[] }
    const vagueParSeance = new Map((seancesDesVagues ?? []).map((s) => [s.id, s.cohort_id]))
    const classeParSeance = new Map((seancesDesVagues ?? []).map((s) => [s.id, s.cohort_class_id]))

    /* TOUTES les écritures de ces élèves, et non les seules rattachées à une séance des vagues :
       les reprises d'antériorité (0140) n'en ont aucune, et un filtre `in('session_id', ...)`
       les écarte en silence. C'est ce filtre qui, jusqu'au 2026-11-20, faisait passer pour
       débutants 21 élèves sur 25 — voir src/lib/heuresCollectif.ts. Le tri se fait ensuite en
       mémoire, élève par élève. */
    const { data: debitsVague } = await selectionParLots<{
      student_id: string | null
      heures: number
      session_id: string | null
      package_id: string | null
    }>(etudiantsEnVague, (lot) =>
      supabase
        .from('hour_ledger')
        .select('student_id, heures, session_id, package_id')
        .eq('type_ecriture', 'debit_etudiant')
        .in('student_id', lot),
    )

    const classeParForfait = new Map<string, string | null>((forfaits ?? []).map((f) => [f.id, f.cohort_class_id]))
    const forfaitsCollectifsDe = new Map<string, Set<string>>()
    for (const f of forfaits ?? []) {
      if (!f.student_id || f.type_programme !== 'collectif') continue
      const sienS = forfaitsCollectifsDe.get(f.student_id) ?? new Set<string>()
      sienS.add(f.id)
      forfaitsCollectifsDe.set(f.student_id, sienS)
    }

    const consommeesDansVague = new Map<string, number>()
    for (const debit of debitsVague ?? []) {
      if (!debit.student_id) continue
      const classeDeLEleve = classeParEtudiant.get(debit.student_id)
      const vagueDeLEleve = vagueParEtudiant.get(debit.student_id)
      let compte: boolean
      if (debit.session_id) {
        // Chemin ordinaire : la séance décomptée dit où l'heure a été suivie.
        compte = classeDeLEleve
          ? classeParSeance.get(debit.session_id) === classeDeLEleve
          : !!vagueDeLEleve && vagueParSeance.get(debit.session_id) === vagueDeLEleve
      } else if (debit.package_id) {
        /* Reprise d'antériorité : c'est le forfait alimenté qui situe l'écriture. En portée
           vague, un forfait collectif de l'élève suffit — il ne peut relever que de la vague où
           il est inscrit. */
        compte = classeDeLEleve
          ? classeParForfait.get(debit.package_id) === classeDeLEleve
          : !!vagueDeLEleve && (forfaitsCollectifsDe.get(debit.student_id)?.has(debit.package_id) ?? false)
      } else {
        compte = false
      }
      if (!compte) continue
      consommeesDansVague.set(debit.student_id, (consommeesDansVague.get(debit.student_id) ?? 0) + Number(debit.heures))
    }

    const totalForfaits = new Map<string, number>()
    for (const forfait of forfaits ?? []) {
      if (!forfait.student_id) continue
      totalForfaits.set(forfait.student_id, (totalForfaits.get(forfait.student_id) ?? 0) + Number(forfait.total_heures))
    }
    const consommeesTotal = new Map((resumes ?? []).map((r) => [r.student_id, Number(r.heures_consommees)]))

    const etats: Record<string, EtatParcoursEtudiant> = {}
    for (const studentId of studentIds) {
      const vagueDeLEleve = vagueParEtudiant.get(studentId)
      const { forfait, consommees } = vagueDeLEleve
        ? {
            forfait: forfaitParVague.get(vagueDeLEleve) ?? forfaitCollectifDefaut,
            consommees: consommeesDansVague.get(studentId) ?? 0,
          }
        : { forfait: totalForfaits.get(studentId) ?? null, consommees: consommeesTotal.get(studentId) ?? 0 }

      etats[studentId] = {
        forfaitEpuise: forfaitEntierementConsomme(consommees, forfait),
        sansCoursPlanifie: !avecCoursAVenir.has(studentId),
        forfait,
        consommees,
      }
    }
    return etats
  })

  return { etats: valeur ?? {}, loading, recharger }
}
