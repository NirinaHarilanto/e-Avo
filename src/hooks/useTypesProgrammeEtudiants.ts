import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export interface ProgrammeEtudiant {
  libelle: string
  ton: 'teal' | 'bleu' | 'or'
}

/* Résume, pour une liste d'étudiants, leur programme (individuel, duo ou collectif) — demande
   client du 2026-09-21 : un petit tag discret dans la liste Étudiants de l'espace admin. Même
   pattern que useStatutsContratsSignature (une requête groupée plutôt qu'une par ligne).

   Un étudiant collectif se reconnaît à sa présence dans cohort_enrollments, jamais à une colonne
   sur profiles (voir migration 0027) ; individuel/duo se lit du dernier forfait souscrit
   (packages.type_programme). Le collectif prime : un élève n'a normalement pas les deux, mais si
   c'était le cas, c'est la vague qui définit son quotidien. */
export function useTypesProgrammeEtudiants(profileIds: string[]) {
  const [programmes, setProgrammes] = useState<Record<string, ProgrammeEtudiant>>({})
  const cleIds = profileIds.join(',')

  useEffect(() => {
    if (!cleIds) {
      setProgrammes({})
      return
    }
    const ids = cleIds.split(',')

    Promise.all([
      supabase.from('cohort_enrollments').select('student_id, cohort_id').in('student_id', ids),
      supabase.from('packages').select('student_id, type_programme, created_at').in('student_id', ids).order('created_at', { ascending: false }),
    ]).then(async ([{ data: enrollments }, { data: forfaits }]) => {
      const cohortIds = [...new Set((enrollments ?? []).map((e) => e.cohort_id))]
      const { data: vagues } = cohortIds.length
        ? await supabase.from('cohorts').select('id, nom').in('id', cohortIds)
        : { data: [] as { id: string; nom: string }[] }
      const nomVagueParId = new Map((vagues ?? []).map((v) => [v.id, v.nom]))

      const resultat: Record<string, ProgrammeEtudiant> = {}
      for (const inscription of enrollments ?? []) {
        if (resultat[inscription.student_id]) continue
        resultat[inscription.student_id] = {
          libelle: `Collectif · ${nomVagueParId.get(inscription.cohort_id) ?? 'vague'}`,
          ton: 'teal',
        }
      }
      for (const forfait of forfaits ?? []) {
        if (resultat[forfait.student_id]) continue
        resultat[forfait.student_id] = {
          libelle: forfait.type_programme === 'duo' ? 'Duo' : 'Individuel',
          ton: forfait.type_programme === 'duo' ? 'or' : 'bleu',
        }
      }
      setProgrammes(resultat)
    })
  }, [cleIds])

  return programmes
}
