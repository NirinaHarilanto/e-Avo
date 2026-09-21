import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type StudentPayment = Database['public']['Tables']['student_payments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Package = Database['public']['Tables']['packages']['Row']

export interface PaiementEtudiant {
  paiement: StudentPayment
  etudiant: Profile | null
  forfait: Package | null
  professeur: Profile | null
}

/* Forfait souscrit par un élève qui a bien un professeur attribué, mais pour lequel aucune
   ligne de paiement n'a encore été créée — demande client du 2026-09-21 : « tous les étudiants
   ayant déjà choisi son forfait et un professeur doivent s'afficher dans la section paiement,
   avec un tag À payer ». Ce n'est pas une ligne de `student_payments` : elle n'existe pas
   encore en base, elle se matérialise au premier acompte saisi depuis la fenêtre de détail. */
export interface ForfaitAPayer {
  forfait: Package
  etudiant: Profile | null
  professeur: Profile | null
}

export function usePaiementsEtudiants() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('paiements-etudiants', async () => {
    const [{ data, error }, { data: forfaits }, { data: affectations }] = await Promise.all([
      /* `student_id is not null` : depuis 0056, une ligne peut être rattachée à un prospect pas
         encore converti. Elle a sa place dans la fiche du prospect, pas dans la page Paiements
         des étudiants — elle y entrera d'elle-même à la conversion, qui lui pose son student_id. */
      supabase
        .from('student_payments')
        .select('*')
        .is('supprime_le', null)
        .not('student_id', 'is', null)
        .order('date_echeance', { ascending: true, nullsFirst: false }),
      supabase.from('packages').select('*').order('created_at', { ascending: false }),
      /* L'affectation courante se reconnaît à `date_fin is null`, jamais à un rang de tri —
         voir migration 0039 et l'index unique partiel qui garantit l'unicité. */
      supabase.from('teacher_assignments').select('student_id, teacher_id').is('date_fin', null),
    ])
    if (error) throw new Error(error.message)

    const professeurParEleve = new Map((affectations ?? []).map((a) => [a.student_id, a.teacher_id]))

    const profileIds = [
      ...new Set([
        ...(data ?? []).map((p) => p.student_id).filter((id): id is string => !!id),
        ...(forfaits ?? []).map((f) => f.student_id),
        ...(affectations ?? []).map((a) => a.teacher_id),
      ]),
    ]
    const { data: profils } = profileIds.length
      ? await supabase.from('profiles').select('*').in('id', profileIds)
      : { data: [] as Profile[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))
    const forfaitParId = new Map((forfaits ?? []).map((f) => [f.id, f]))

    const professeurDe = (studentId: string) => {
      const teacherId = professeurParEleve.get(studentId)
      return teacherId ? (profilParId.get(teacherId) ?? null) : null
    }

    const paiements = (data ?? []).map((paiement): PaiementEtudiant => ({
      paiement,
      etudiant: paiement.student_id ? (profilParId.get(paiement.student_id) ?? null) : null,
      forfait: paiement.package_id ? (forfaitParId.get(paiement.package_id) ?? null) : null,
      professeur: paiement.student_id ? professeurDe(paiement.student_id) : null,
    }))

    const forfaitsDejaFactures = new Set((data ?? []).map((p) => p.package_id).filter((id): id is string => !!id))
    const forfaitsAPayer = (forfaits ?? [])
      .filter((f) => !forfaitsDejaFactures.has(f.id) && professeurParEleve.has(f.student_id))
      .map((forfait): ForfaitAPayer => ({
        forfait,
        etudiant: profilParId.get(forfait.student_id) ?? null,
        professeur: professeurDe(forfait.student_id),
      }))

    return { paiements, forfaitsAPayer }
  })

  return {
    paiements: valeur?.paiements ?? [],
    forfaitsAPayer: valeur?.forfaitsAPayer ?? [],
    loading,
    erreur,
    recharger,
  }
}
