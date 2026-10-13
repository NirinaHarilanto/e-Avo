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

    /* Plus de filtre `in(ids)` (optimisation du 2026-10-13) : il obligeait à ATTENDRE la liste des
       élèves avant de pouvoir partir, ajoutant une vague de requêtes au chemin critique de la page
       Étudiants — environ 2,5 s, pour deux tables qui tiennent en quelques dizaines de lignes. La
       RLS les borne déjà à l'établissement, donc tout charger coûte le même transfert tout en
       partant immédiatement, en parallèle du reste. Le filtrage se fait ensuite en mémoire. */
    const voulus = new Set(cleIds.split(','))

    Promise.all([
      supabase.from('cohort_enrollments').select('student_id, cohort_id'),
      supabase.from('packages').select('student_id, type_programme, created_at').order('created_at', { ascending: false }),
    ]).then(([{ data: toutesInscriptions }, { data: tousForfaits }]) => {
      const enrollments = (toutesInscriptions ?? []).filter((i) => voulus.has(i.student_id))
      const forfaits = (tousForfaits ?? []).filter((f) => voulus.has(f.student_id))
      /* Libellés courts (demande client du 2026-10-11, capture à l'appui : « il y a trop
         d'informations [...] il faut que le nom et les badges tiennent sur une ligne ») — la
         vague n'est plus dans ce tag, elle reste visible dans le dossier (onglet Programme). */
      const resultat: Record<string, ProgrammeEtudiant> = {}
      for (const inscription of enrollments ?? []) {
        if (resultat[inscription.student_id]) continue
        resultat[inscription.student_id] = { libelle: 'Collectif', ton: 'teal' }
      }
      /* Les trois types, pas deux (2026-10-13) : un forfait collectif sans inscription de vague
         retrouvée tombait sur « INDIV ». En pratique l'inscription existe presque toujours et le
         marque « Collectif » juste au-dessus, mais le ternaire mentait dès qu'elle manquait. */
      const LIBELLE_COURT = { individuel: 'INDIV', duo: 'DUO', collectif: 'Collectif' } as const
      const TON_COURT = { individuel: 'bleu', duo: 'or', collectif: 'teal' } as const
      for (const forfait of forfaits ?? []) {
        if (resultat[forfait.student_id]) continue
        resultat[forfait.student_id] = {
          libelle: LIBELLE_COURT[forfait.type_programme],
          ton: TON_COURT[forfait.type_programme],
        }
      }
      setProgrammes(resultat)
    })
  }, [cleIds])

  return programmes
}
