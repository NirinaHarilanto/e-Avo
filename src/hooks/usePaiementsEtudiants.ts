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
  /* Partenaire DUO de l'élève (0054), quel que soit le sens du lien — demande client du
     2026-09-23 : « dans toutes les fenêtres [...] afficher les deux noms des personnes formant
     le DUO ». Un paiement (forfait partagé ou heure d'essai individuelle) ne concerne jamais
     qu'un membre du binôme à la fois côté `student_payments`, mais reste toujours SON paiement
     à elle/lui aussi. */
  duoPartenaire: Profile | null
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
  duoPartenaire: Profile | null
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
    // Un élève supprimé disparaît de la page Paiements — son paiement, comme son forfait « à
    // payer », reste en base mais n'y apparaît plus (demande client du 2026-09-23). Le
    // professeur, lui, n'est PAS filtré ici : son nom peut légitimement manquer (deleted) sans
    // faire disparaître le paiement de l'élève, qui le concerne au premier chef.
    const { data: profils } = profileIds.length
      ? await supabase.from('profiles').select('*').in('id', profileIds)
      : { data: [] as Profile[] }
    const etudiantsActifsIds = new Set((profils ?? []).filter((p) => p.status !== 'suspended').map((p) => p.id))
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))
    const forfaitParId = new Map((forfaits ?? []).map((f) => [f.id, f]))

    /* Partenaire DUO de chaque élève concerné par un paiement — le lien est ASYMÉTRIQUE
       (0054, migration 0054_forfait_choisi_et_duo.sql) : un secondaire porte son
       `duo_partenaire_id`, le principal ne porte rien et se retrouve donc à l'inverse, via une
       recherche de qui pointe VERS lui. Deux requêtes complémentaires plutôt qu'une seule pour
       couvrir les deux sens. */
    const idsEtudiantsConcernes = [
      ...new Set([...(data ?? []).map((p) => p.student_id).filter((id): id is string => !!id), ...(forfaits ?? []).map((f) => f.student_id)]),
    ]
    const idsSecondairesConnus = idsEtudiantsConcernes
      .map((id) => profilParId.get(id)?.duo_partenaire_id)
      .filter((id): id is string => !!id)
    const [{ data: principauxManquants }, { data: secondairesDeCesEtudiants }] = await Promise.all([
      idsSecondairesConnus.length
        ? supabase.from('profiles').select('*').in('id', idsSecondairesConnus).neq('status', 'suspended')
        : Promise.resolve({ data: [] as Profile[] }),
      idsEtudiantsConcernes.length
        ? supabase.from('profiles').select('*').in('duo_partenaire_id', idsEtudiantsConcernes).neq('status', 'suspended')
        : Promise.resolve({ data: [] as Profile[] }),
    ])
    for (const p of principauxManquants ?? []) profilParId.set(p.id, p)
    const partenaireParEtudiant = new Map<string, Profile>()
    for (const secondaire of secondairesDeCesEtudiants ?? []) {
      if (secondaire.duo_partenaire_id) partenaireParEtudiant.set(secondaire.duo_partenaire_id, secondaire)
    }
    const partenaireDe = (studentId: string): Profile | null => {
      const viaSecondaire = profilParId.get(studentId)?.duo_partenaire_id
      if (viaSecondaire) return profilParId.get(viaSecondaire) ?? null
      return partenaireParEtudiant.get(studentId) ?? null
    }

    const professeurDe = (studentId: string) => {
      const teacherId = professeurParEleve.get(studentId)
      return teacherId ? (profilParId.get(teacherId) ?? null) : null
    }

    const paiements = (data ?? [])
      .filter((paiement) => !paiement.student_id || etudiantsActifsIds.has(paiement.student_id))
      .map((paiement): PaiementEtudiant => ({
        paiement,
        etudiant: paiement.student_id ? (profilParId.get(paiement.student_id) ?? null) : null,
        forfait: paiement.package_id ? (forfaitParId.get(paiement.package_id) ?? null) : null,
        professeur: paiement.student_id ? professeurDe(paiement.student_id) : null,
        duoPartenaire: paiement.student_id ? partenaireDe(paiement.student_id) : null,
      }))

    const forfaitsDejaFactures = new Set((data ?? []).map((p) => p.package_id).filter((id): id is string => !!id))
    const forfaitsAPayer = (forfaits ?? [])
      .filter((f) => !forfaitsDejaFactures.has(f.id) && professeurParEleve.has(f.student_id) && etudiantsActifsIds.has(f.student_id))
      .map((forfait): ForfaitAPayer => ({
        forfait,
        etudiant: profilParId.get(forfait.student_id) ?? null,
        professeur: professeurDe(forfait.student_id),
        duoPartenaire: partenaireDe(forfait.student_id),
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
