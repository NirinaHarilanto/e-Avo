/* Résolution du professeur et des camarades d'un élève en cours collectif, au niveau de SA
   CLASSE de niveau (Beginner/Intermediate/Advanced, 0074) quand la promotion en a, ou de la
   promotion entière sinon — demande client du 2026-10-11 : « l'attribution de professeur [...]
   sera instantanément prise en compte dans toute l'application, y compris les étudiants qui
   font partie de la classe concernée par le professeur ».

   Avant ce correctif, useVagueEtudiant.ts lisait uniquement `cohorts.teacher_id` : juste pour la
   promotion entière, jamais la classe. Deux classes d'une même vague confiées à deux professeurs
   différents montraient alors le MÊME nom à tous les élèves de la promotion — y compris ceux dont
   la classe avait un professeur différent, ou aucun. Fonction pure, aucune requête : testable
   isolément, comme suiviCollectif.ts. */

export interface InscriptionBrute {
  student_id: string
  cohort_class_id: string | null
}

export interface GroupeEtudiant {
  professeurId: string | null
  camaradeIds: string[]
}

/* `monInscription` peut être absente en théorie (élève retiré entre deux requêtes) : traité comme
   sans classe, replié sur le professeur de la promotion entière plutôt que de planter. */
export function resoudreGroupeEtudiant(
  studentId: string,
  monInscription: InscriptionBrute | undefined,
  toutesLesInscriptions: InscriptionBrute[],
  teacherIdClasse: string | null,
  teacherIdCohorte: string | null,
): GroupeEtudiant {
  const classeId = monInscription?.cohort_class_id ?? null
  return {
    professeurId: classeId ? teacherIdClasse : teacherIdCohorte,
    camaradeIds: toutesLesInscriptions
      .filter((i) => i.student_id !== studentId)
      .filter((i) => (classeId ? i.cohort_class_id === classeId : true))
      .map((i) => i.student_id),
  }
}
