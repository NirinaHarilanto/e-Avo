import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { chargerProfilsEtablissement, indexPartenairesDuo } from '../lib/profilsEtablissement'
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
  /* Moyen de paiement ET référence effectifs (2026-10-13) : `student_payments.moyen_paiement`/
     `reference` ne sont renseignés QUE si le paiement a été réglé en une fois, dès sa création.
     Réglé en acompte(s) depuis la fenêtre de détail (DetailPaiementModale.tsx,
     `ajouterVersement`), ce que l'admin saisit n'est écrit QUE sur `paiement_versements`, jamais
     reporté sur le paiement — l'information existait, la page Paiements regardait juste au
     mauvais endroit. Retombe sur le plus récent versement qui en précise un, à défaut le
     paiement lui-même. */
  moyenPaiementEffectif: string | null
  referenceEffective: string | null
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
    /* Tout part ensemble (optimisation du 2026-10-13). Cette page enchaînait quatre vagues de
       requêtes — paiements, puis leurs acomptes, puis les profils des personnes concernées, puis
       les partenaires de binôme de ces personnes — chacune attendant la précédente. Les profils
       sont désormais chargés d'un bloc (voir lib/profilsEtablissement.ts) et les acomptes sans
       filtre par paiement : la RLS borne déjà ces tables à l'établissement, le volume est le même,
       mais plus rien n'attend. */
    const [{ data, error }, { data: forfaits }, { data: affectations }, profilsTous, { data: versements }] = await Promise.all([
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
      chargerProfilsEtablissement(),
      /* Moyen de paiement reporté depuis les acomptes (voir le commentaire de
         `moyenPaiementEffectif` ci-dessus) : le plus récent par paiement gagne si plusieurs
         acomptes ont utilisé des moyens différents — c'est la dernière valeur saisie par l'admin,
         la plus probable à jour. */
      supabase
        .from('paiement_versements')
        .select('student_payment_id, moyen_paiement, reference, date_versement')
        .order('date_versement', { ascending: false }),
    ])
    if (error) throw new Error(error.message)
    const moyenVersementParPaiement = new Map<string, string>()
    const referenceVersementParPaiement = new Map<string, string>()
    for (const v of versements ?? []) {
      if (!v.student_payment_id) continue
      if (v.moyen_paiement && !moyenVersementParPaiement.has(v.student_payment_id)) {
        moyenVersementParPaiement.set(v.student_payment_id, v.moyen_paiement)
      }
      if (v.reference && !referenceVersementParPaiement.has(v.student_payment_id)) {
        referenceVersementParPaiement.set(v.student_payment_id, v.reference)
      }
    }

    const professeurParEleve = new Map((affectations ?? []).map((a) => [a.student_id, a.teacher_id]))

    // Un élève supprimé disparaît de la page Paiements — son paiement, comme son forfait « à
    // payer », reste en base mais n'y apparaît plus (demande client du 2026-09-23). Le
    // professeur, lui, n'est PAS filtré ici : son nom peut légitimement manquer (deleted) sans
    // faire disparaître le paiement de l'élève, qui le concerne au premier chef.
    const etudiantsActifsIds = new Set(profilsTous.filter((p) => p.status !== 'suspended').map((p) => p.id))
    const profilParId = new Map(profilsTous.map((p) => [p.id, p]))
    const forfaitParId = new Map((forfaits ?? []).map((f) => [f.id, f]))

    /* Partenaire DUO, résolu en mémoire sur les profils déjà chargés (le lien est asymétrique —
       voir lib/profilsEtablissement.ts) : c'étaient deux requêtes de plus, et surtout une vague
       d'attente supplémentaire puisqu'elles ne pouvaient partir qu'une fois les profils connus. */
    const partenaireDe = indexPartenairesDuo(profilsTous)

    const professeurDe = (studentId: string) => {
      const teacherId = professeurParEleve.get(studentId)
      return teacherId ? (profilParId.get(teacherId) ?? null) : null
    }

    /* Forfait sans prix propre d'un élève (typiquement son forfait collectif, voir plus bas) —
       le plus récent si plusieurs, grâce à l'ordre déjà demandé sur `forfaits`. Sert à retrouver
       le forfait d'un paiement SANS `package_id` (demande client du 2026-10-13 : l'affichage
       d'une ligne de paiement doit toujours montrer le type de forfait, jamais seulement pour
       celles qui ont un `package_id`). */
    const forfaitSansPrixParEleve = new Map<string, Package>()
    for (const f of forfaits ?? []) {
      if (f.montant == null && !forfaitSansPrixParEleve.has(f.student_id)) forfaitSansPrixParEleve.set(f.student_id, f)
    }
    const forfaitDuPaiement = (paiement: StudentPayment): Package | null => {
      if (paiement.package_id) return forfaitParId.get(paiement.package_id) ?? null
      return paiement.student_id ? (forfaitSansPrixParEleve.get(paiement.student_id) ?? null) : null
    }

    const paiements = (data ?? [])
      .filter((paiement) => !paiement.student_id || etudiantsActifsIds.has(paiement.student_id))
      .map((paiement): PaiementEtudiant => ({
        paiement,
        etudiant: paiement.student_id ? (profilParId.get(paiement.student_id) ?? null) : null,
        forfait: forfaitDuPaiement(paiement),
        professeur: paiement.student_id ? professeurDe(paiement.student_id) : null,
        duoPartenaire: paiement.student_id ? partenaireDe(paiement.student_id) : null,
        moyenPaiementEffectif: paiement.moyen_paiement ?? moyenVersementParPaiement.get(paiement.id) ?? null,
        referenceEffective: paiement.reference ?? referenceVersementParPaiement.get(paiement.id) ?? null,
      }))

    const forfaitsDejaFactures = new Set((data ?? []).map((p) => p.package_id).filter((id): id is string => !!id))
    /* Un paiement sans `package_id` ne vise aucun forfait précis : ce sont les frais d'inscription
       collectifs, créés au stade prospect puis rattachés à l'élève à la conversion
       (convert-prospect.ts). Ils couvrent les forfaits SANS prix propre de cet élève — typiquement
       son forfait collectif, dont `packages.montant` reste null justement parce que le prix est
       porté par cette ligne de frais. Sans ce rapprochement (incident du 2026-10-13), l'élève
       apparaissait DEUX FOIS sur la page Paiements : son vrai paiement de frais, et son forfait
       collectif annoncé « aucun paiement enregistré ». Un forfait qui a SON PROPRE montant n'est
       jamais couvert ainsi : il reste dû tant qu'aucun paiement ne le référence explicitement. */
    const elevesAvecFraisLibres = new Set(
      (data ?? []).filter((p) => !p.package_id && p.student_id).map((p) => p.student_id as string),
    )
    const forfaitsAPayer = (forfaits ?? [])
      .filter(
        (f) =>
          !forfaitsDejaFactures.has(f.id) &&
          !(f.montant == null && elevesAvecFraisLibres.has(f.student_id)) &&
          professeurParEleve.has(f.student_id) &&
          etudiantsActifsIds.has(f.student_id),
      )
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
