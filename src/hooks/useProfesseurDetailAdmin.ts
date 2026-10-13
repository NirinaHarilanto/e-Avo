import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { chargerProfilsEtablissement } from '../lib/profilsEtablissement'
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
    /* TOUT part ensemble (optimisation du 2026-10-13). Cette fiche enchaînait cinq vagues de
       requêtes — le professeur, puis ses affectations, puis les six requêtes portant les
       identifiants de ses élèves, puis les visios de ses séances à venir, puis les inscriptions de
       ses séances terminées. Un aller-retour coûte ici 330 ms au mieux : c'est leur NOMBRE qui
       faisait l'attente, pas le volume. Les tables filtrées par identifiant sont désormais lues
       d'un bloc — la RLS les borne déjà à l'établissement — et recoupées en mémoire, pour un
       résultat identique. Les deux requêtes `sessions` n'en font plus qu'une, les deux filtres
       étant discriminés plus bas. */
    const maintenant = new Date().toISOString()
    const [
      profilsTous,
      { data: affectations },
      { data: tousPackages },
      { data: tousPaiements },
      { data: toutesSessions },
      { data: integrationEtab },
      { data: toutesInscriptions },
      { data: toutesVisios },
    ] = await Promise.all([
      chargerProfilsEtablissement(),
      supabase
        .from('teacher_assignments')
        .select('*')
        .eq('teacher_id', teacherId as string)
        .is('date_fin', null)
        .order('date_debut', { ascending: false }),
      supabase.from('packages').select('*'),
      // Même filtre `supprime_le is null` que usePaiementsEtudiants.ts : une ligne supprimée
      // (motif conservé, mais retirée de la vue) ne doit pas compter pour le statut affiché ici.
      supabase.from('student_payments').select('student_id, package_id, montant, montant_regle, statut').is('supprime_le', null),
      supabase.from('sessions').select('id, duree_minutes, statut, type, debut').eq('teacher_id', teacherId as string),
      supabase.from('google_integration_statut').select('google_email').maybeSingle(),
      /* Bornées aux séances de CE professeur côté serveur, par un embed `!inner` sur `sessions` :
         elles ne dépendent donc d'aucune requête précédente (une seule vague) tout en ne
         transférant que ce qui sert. Sans cet embed, il fallait d'abord recevoir les séances pour
         pouvoir nommer leurs identifiants — c'était la vague en trop. */
      supabase.from('session_enrollments').select('session_id, student_id, present, sessions!inner(teacher_id)').eq('sessions.teacher_id', teacherId as string).eq('present', true),
      supabase.from('video_sessions').select('session_id, organisateur_email, sessions!inner(teacher_id)').eq('sessions.teacher_id', teacherId as string),
    ])

    // Un accès direct par URL à un professeur supprimé (il n'apparaît plus dans aucune liste
    // depuis sa suppression, mais son identifiant reste valide) ne doit pas exposer sa fiche —
    // demande client du 2026-09-23 : « son espace personnel » fait partie de ce qui disparaît.
    const professeur = profilsTous.find((p) => p.id === teacherId)
    if (!professeur || professeur.status === 'suspended') throw new Error('Professeur introuvable.')

    const studentIds = new Set((affectations ?? []).map((a) => a.student_id))
    // Un élève supprimé (soft-delete) garde son affectation `teacher_assignments` (date_fin
    // toujours null) — sans ce filtre il continuait à apparaître dans la fiche du professeur
    // comme un élève actuel alors que son compte n'existe plus (demande client du 2026-09-23).
    const eleveProfiles = profilsTous.filter((p) => studentIds.has(p.id) && p.status !== 'suspended')
    const packages = (tousPackages ?? []).filter((p) => studentIds.has(p.student_id))
    const paiements = (tousPaiements ?? []).filter((p) => p.student_id && studentIds.has(p.student_id))
    const sessionsTerminees = (toutesSessions ?? []).filter((s) => s.statut === 'terminee')
    const seancesAVenir = (toutesSessions ?? []).filter(
      (s) => s.type === 'individuel' && s.statut === 'planifiee' && s.debut >= maintenant,
    )

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
       une requête à part, pas une jointure. Elle ne compte que si l'établissement a bien un compte
       Google connecté — sinon aucune réunion ne peut être « hébergée par l'établissement ». Le
       rapprochement se fait en mémoire depuis le 2026-10-13 : attendre les séances à venir pour
       pouvoir nommer leurs visios ajoutait une vague entière au chemin critique de la fiche. */
    const idsSeancesAVenir = new Set(seancesAVenir.map((s) => s.id))
    const seancesHergeesParEtablissement = integrationEtab?.google_email
      ? (toutesVisios ?? []).filter(
          (v) => idsSeancesAVenir.has(v.session_id) && v.organisateur_email === integrationEtab.google_email,
        ).length
      : 0

    const eleveParId = new Map((eleveProfiles ?? []).map((e) => [e.id, e]))
    const packagesParEleve = new Map<string, Package[]>()
    for (const pkg of packages ?? []) {
      packagesParEleve.set(pkg.student_id, [...(packagesParEleve.get(pkg.student_id) ?? []), pkg])
    }

    const dureeParSession = new Map(sessionsTerminees.map((s) => [s.id, s.duree_minutes]))
    const heuresParEleve = new Map<string, number>()
    // Les inscriptions présentes sont déjà chargées : ne restent que celles des séances terminées
    // de CE professeur, `dureeParSession` ne connaissant que celles-là.
    for (const enrollment of toutesInscriptions ?? []) {
      const duree = dureeParSession.get(enrollment.session_id)
      if (duree === undefined) continue
      heuresParEleve.set(enrollment.student_id, (heuresParEleve.get(enrollment.student_id) ?? 0) + duree / 60)
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
