import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'
import { statutReglement, type StatutReglement } from '../lib/paiements'

type Profile = Database['public']['Tables']['profiles']['Row']
type TeacherAssignment = Database['public']['Tables']['teacher_assignments']['Row']
type Package = Database['public']['Tables']['packages']['Row']

export interface EleveDuProfesseur {
  eleve: Profile
  affectation: TeacherAssignment
  /* Heures enseignées PAR CE professeur À CET élève — dérivé de sessions ⋈
     session_enrollments (statut terminée, présence), PAS de hour_ledger : les écritures
     credit_professeur n'y portent aucun student_id (voir 0011_hour_ledger.sql), elles ne
     permettent donc de connaître que le total toutes classes confondues. */
  heuresEnseignees: number
  packages: Package[]
  /* État de règlement de chaque forfait ci-dessus (clé = packages.id), même calcul que la page
     Paiements (usePaiementsEtudiants.ts) : un forfait sans ligne `student_payments` compte comme
     entièrement « à payer ». Demande client du 2026-10-12 — capture à l'appui : la colonne de
     droite de chaque forfait affichait son échéance de planning (packages.echeance, posée par
     « Planning prévisionnel », 0084), lue à tort comme un état de paiement alors que rien ici ne
     renseignait si le forfait était réglé. */
  reglementParPackage: Record<string, StatutReglement>
}

export interface ProfesseurDetail {
  professeur: Profile
  eleves: EleveDuProfesseur[]
  heuresTotalEnseignees: number
  /* Séances individuelles/duo À VENIR dont la visioconférence est encore hébergée par le compte
     Google de l'établissement (0107) — en pratique, celui de l'admin : tant que ce professeur n'a
     pas connecté son propre agenda, ce sont ses futures invitations de cours qui atterrissent
     dans la vraie boîte Gmail de l'admin. Sert à n'afficher le bouton « Retirer de mon agenda
     Google » (api/admin/detacher-visio-etablissement.ts) que lorsqu'il y a effectivement quelque
     chose à détacher. */
  seancesHergeesParEtablissement: number
}

export function useProfesseurDetailAdmin(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(teacherId && `professeur-detail-${teacherId}`, async (): Promise<ProfesseurDetail> => {
    const { data: professeur, error: professeurError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', teacherId as string)
      .single()
    // Un accès direct par URL à un professeur supprimé (il n'apparaît plus dans aucune liste
    // depuis sa suppression, mais son identifiant reste valide) ne doit pas exposer sa fiche —
    // demande client du 2026-09-23 : « son espace personnel » fait partie de ce qui disparaît.
    if (professeurError || !professeur || professeur.status === 'suspended') {
      throw new Error(professeurError?.message ?? 'Professeur introuvable.')
    }

    const { data: affectations } = await supabase
      .from('teacher_assignments')
      .select('*')
      .eq('teacher_id', teacherId as string)
      .is('date_fin', null)
      .order('date_debut', { ascending: false })

    const studentIds = [...new Set((affectations ?? []).map((a) => a.student_id))]

    // Un élève supprimé (soft-delete) garde son affectation `teacher_assignments` (date_fin
    // toujours null) — sans ce filtre il continuait à apparaître dans la fiche du professeur
    // comme un élève actuel alors que son compte n'existe plus (demande client du 2026-09-23).
    const [{ data: eleveProfiles }, { data: packages }, { data: paiements }, { data: sessionsTerminees }, { data: integrationEtab }, { data: seancesAVenir }] = await Promise.all([
      studentIds.length > 0 ? supabase.from('profiles').select('*').in('id', studentIds).neq('status', 'suspended') : Promise.resolve({ data: [] as Profile[] }),
      studentIds.length > 0 ? supabase.from('packages').select('*').in('student_id', studentIds) : Promise.resolve({ data: [] as Package[] }),
      // Même filtre `supprime_le is null` que usePaiementsEtudiants.ts : une ligne supprimée
      // (motif conservé, mais retirée de la vue) ne doit pas compter pour le statut affiché ici.
      studentIds.length > 0
        ? supabase.from('student_payments').select('student_id, package_id, montant, montant_regle, statut').in('student_id', studentIds).is('supprime_le', null)
        : Promise.resolve({ data: [] as { student_id: string | null; package_id: string | null; montant: number; montant_regle: number; statut: Database['public']['Tables']['student_payments']['Row']['statut'] }[] }),
      supabase.from('sessions').select('id, duree_minutes').eq('teacher_id', teacherId as string).eq('statut', 'terminee'),
      supabase.from('google_integration_statut').select('google_email').maybeSingle(),
      supabase
        .from('sessions')
        .select('id')
        .eq('teacher_id', teacherId as string)
        .eq('type', 'individuel')
        .eq('statut', 'planifiee')
        .gte('debut', new Date().toISOString()),
    ])

    /* Un forfait sans ligne de paiement du tout compte comme entièrement « à payer » (même
       convention que ForfaitAPayer dans usePaiementsEtudiants.ts) — c'est le cas par défaut si
       aucune entrée n'existe dans la map. */
    const paiementParPackage = new Map((paiements ?? []).filter((p) => p.package_id).map((p) => [p.package_id as string, p]))
    /* Frais rattachés à l'élève sans viser un forfait précis (`package_id` null) : frais
       d'inscription collectifs créés au stade prospect, rattachés à l'élève à la conversion.
       Cumulés par élève comme le fait `construireSuiviCollectif`, pour couvrir les forfaits sans
       prix propre — sinon le forfait collectif d'un élève pourtant à jour de ses frais
       s'affichait « À payer » ici (incident du 2026-10-13). */
    const fraisLibresParEleve = new Map<string, { montant: number; montant_regle: number }>()
    for (const p of paiements ?? []) {
      if (p.package_id || !p.student_id) continue
      const cumul = fraisLibresParEleve.get(p.student_id) ?? { montant: 0, montant_regle: 0 }
      fraisLibresParEleve.set(p.student_id, {
        montant: cumul.montant + Number(p.montant),
        montant_regle: cumul.montant_regle + Number(p.montant_regle),
      })
    }
    const reglementParPackage = (pkgs: Package[]): Record<string, StatutReglement> => {
      const resultat: Record<string, StatutReglement> = {}
      for (const pkg of pkgs) {
        const paiement = paiementParPackage.get(pkg.id)
        const fraisLibres = pkg.montant == null ? fraisLibresParEleve.get(pkg.student_id) : undefined
        resultat[pkg.id] = statutReglement(
          paiement ?? (fraisLibres ? { ...fraisLibres, statut: 'attendu' } : { montant: pkg.montant ?? 0, montant_regle: 0, statut: 'attendu' }),
        )
      }
      return resultat
    }

    /* `video_sessions` n'a pas de relation reconnue par PostgREST (voir realigner-visios.ts) :
       une seconde requête, pas une jointure, et seulement si l'établissement a bien un compte
       Google connecté — sinon aucune réunion ne peut être « hébergée par l'établissement ». */
    let seancesHergeesParEtablissement = 0
    if (integrationEtab?.google_email && (seancesAVenir ?? []).length > 0) {
      const { data: visios } = await supabase
        .from('video_sessions')
        .select('organisateur_email')
        .in('session_id', (seancesAVenir ?? []).map((s) => s.id))
      seancesHergeesParEtablissement = (visios ?? []).filter((v) => v.organisateur_email === integrationEtab.google_email).length
    }

    const eleveParId = new Map((eleveProfiles ?? []).map((e) => [e.id, e]))
    const packagesParEleve = new Map<string, Package[]>()
    for (const pkg of packages ?? []) {
      packagesParEleve.set(pkg.student_id, [...(packagesParEleve.get(pkg.student_id) ?? []), pkg])
    }

    const sessionIds = (sessionsTerminees ?? []).map((s) => s.id)
    const dureeParSession = new Map((sessionsTerminees ?? []).map((s) => [s.id, s.duree_minutes]))
    const heuresParEleve = new Map<string, number>()
    if (sessionIds.length > 0) {
      const { data: enrollments } = await supabase
        .from('session_enrollments')
        .select('session_id, student_id, present')
        .in('session_id', sessionIds)
        .eq('present', true)
      for (const enrollment of enrollments ?? []) {
        const duree = dureeParSession.get(enrollment.session_id) ?? 0
        heuresParEleve.set(enrollment.student_id, (heuresParEleve.get(enrollment.student_id) ?? 0) + duree / 60)
      }
    }

    /* Une ligne par élève, pas par affectation : la fiche professeur liste des personnes, un
       même nom ne doit jamais y figurer deux fois (voir aussi useCalendrierProfesseur.ts).
       `affectations` est trié du plus récent au plus ancien, on garde donc la première vue. */
    const affectationParEleve = new Map<string, TeacherAssignment>()
    for (const affectation of affectations ?? []) {
      if (!affectationParEleve.has(affectation.student_id)) {
        affectationParEleve.set(affectation.student_id, affectation)
      }
    }
    const eleves: EleveDuProfesseur[] = [...affectationParEleve.values()]
      .map((affectation) => {
        const eleve = eleveParId.get(affectation.student_id)
        if (!eleve) return null
        const packagesEleve = packagesParEleve.get(affectation.student_id) ?? []
        return {
          eleve,
          affectation,
          heuresEnseignees: heuresParEleve.get(affectation.student_id) ?? 0,
          packages: packagesEleve,
          reglementParPackage: reglementParPackage(packagesEleve),
        }
      })
      .filter((v): v is EleveDuProfesseur => v !== null)

    return {
      professeur,
      eleves,
      heuresTotalEnseignees: [...heuresParEleve.values()].reduce((total, h) => total + h, 0),
      seancesHergeesParEtablissement,
    }
  })

  return { detail: valeur ?? null, loading, erreur, recharger }
}
