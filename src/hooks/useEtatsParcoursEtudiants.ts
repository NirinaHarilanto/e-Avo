import { supabase } from '../lib/supabaseClient'
import { forfaitEntierementConsomme } from '../lib/heures'
import { useCacheRequete } from './useCacheRequete'

export interface EtatParcoursEtudiant {
  /* Toutes les heures souscrites sont consommées. `false` aussi quand aucun forfait n'est connu —
     un parcours qui n'a pas commencé n'est pas un parcours épuisé (voir
     `forfaitEntierementConsomme`). */
  forfaitEpuise: boolean
  /* Aucune séance à venir au planning. C'est l'alerte de la demande 6 (2026-10-19) : un élève
     inscrit, avec un professeur, mais dont rien n'est programmé. */
  sansCoursPlanifie: boolean
}

/* État du parcours de TOUS les étudiants de la liste admin, en une passe — demandes client 6 et 7
   du 2026-10-19 : l'étiquette d'avertissement « aucun cours planifié » et la redéfinition des
   statuts actif/inactif ont besoin des mêmes données, pour toute la liste à la fois. Un hook par
   étudiant aurait multiplié les requêtes par le nombre de lignes affichées.

   Deux règles de forfait, reprises telles quelles de celles qui existent déjà côté serveur
   (api/_lib/finDeForfait.ts) pour que l'écran et les relances automatiques ne puissent pas dire
   deux choses différentes :
   - en vague, le forfait est celui de la vague (à défaut celui de l'établissement) et seules les
     heures consommées DANS cette vague comptent ;
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
      supabase.from('packages').select('student_id, total_heures').in('student_id', studentIds),
      supabase.from('student_hours_summary').select('student_id, heures_consommees').in('student_id', studentIds),
      supabase.from('cohort_enrollments').select('student_id, cohort_id').in('student_id', studentIds),
      /* Seules les séances encore « planifiée » comptent comme un cours à venir : une séance
         annulée n'aura pas lieu, une séance terminée a déjà eu lieu. */
      supabase.from('sessions').select('id').eq('statut', 'planifiee').gte('debut', maintenant),
    ])

    const idsSeancesAVenir = (seancesAVenir ?? []).map((s) => s.id)
    const { data: inscriptionsSeances } = idsSeancesAVenir.length > 0
      ? await supabase
          .from('session_enrollments')
          .select('student_id')
          .in('student_id', studentIds)
          .in('session_id', idsSeancesAVenir)
      : { data: [] as { student_id: string }[] }
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

    /* Heures consommées dans une vague : il faut les débits rattachés aux séances de CETTE vague,
       pas le total de la vie du dossier — un élève passé par un parcours individuel avant de
       rejoindre une vague verrait sinon celle-ci déclarée terminée d'emblée (même précaution que
       `heuresConsommeesDansVague`, api/_lib/finDeForfait.ts). */
    const etudiantsEnVague = [...vagueParEtudiant.keys()]
    const { data: seancesDesVagues } = cohortIds.length > 0 && etudiantsEnVague.length > 0
      ? await supabase.from('sessions').select('id, cohort_id').in('cohort_id', cohortIds)
      : { data: [] as { id: string; cohort_id: string | null }[] }
    const vagueParSeance = new Map((seancesDesVagues ?? []).map((s) => [s.id, s.cohort_id]))

    const { data: debitsVague } = vagueParSeance.size > 0
      ? await supabase
          .from('hour_ledger')
          .select('student_id, heures, session_id')
          .in('student_id', etudiantsEnVague)
          .eq('type_ecriture', 'debit_etudiant')
          .in('session_id', [...vagueParSeance.keys()])
      : { data: [] as { student_id: string | null; heures: number; session_id: string | null }[] }

    const consommeesDansVague = new Map<string, number>()
    for (const debit of debitsVague ?? []) {
      if (!debit.student_id || !debit.session_id) continue
      const vagueDeLEleve = vagueParEtudiant.get(debit.student_id)
      if (!vagueDeLEleve || vagueParSeance.get(debit.session_id) !== vagueDeLEleve) continue
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
      }
    }
    return etats
  })

  return { etats: valeur ?? {}, loading, recharger }
}
