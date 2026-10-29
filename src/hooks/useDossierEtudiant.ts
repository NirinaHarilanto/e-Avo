import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { chargerProfilsEtablissement } from '../lib/profilsEtablissement'
import { seancesHorsAffectation } from '../lib/seances'
import { useCacheRequete } from './useCacheRequete'

type Profile = Database['public']['Tables']['profiles']['Row']
type TeacherAssignment = Database['public']['Tables']['teacher_assignments']['Row']
type Session = Database['public']['Tables']['sessions']['Row']
type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type DiagnosticCall = Database['public']['Tables']['diagnostic_calls']['Row']
type Package = Database['public']['Tables']['packages']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']
type Cohort = Database['public']['Tables']['cohorts']['Row']
type CohortClass = Database['public']['Tables']['cohort_classes']['Row']
type Tarif = Database['public']['Tables']['tarifs']['Row']

export interface SeanceDuParcours {
  enrollment: SessionEnrollment
  session: Session
  video: VideoSession | null
}

export interface PeriodeProfesseur {
  affectation: TeacherAssignment
  professeur: Profile | null
  seances: SeanceDuParcours[]
}

export interface DossierEtudiant {
  etudiant: Profile
  periodes: PeriodeProfesseur[]
  /* Séances suivies hors de toute affectation individuelle : celles de la classe de niveau d'un
     élève en cours collectif (0074). Elles n'appartiennent à aucune `PeriodeProfesseur`, qui se
     construit à partir de `teacher_assignments` — un élève collectif n'en a aucun. */
  seancesCollectives: SeanceDuParcours[]
  /* Affectations EN COURS, reconnues à `date_fin is null` — jamais « la première période de la
     liste ». Deux affectations peuvent partager la même `date_debut` (c'est une date, pas un
     instant : un changement de professeur le jour même en crée deux), et à égalité PostgreSQL
     ne garantit aucun ordre.
     Une liste, et plus une seule période, depuis 0138 : un étudiant peut avoir plusieurs
     professeurs simultanés (demande client du 2026-10-27). 0039 garantissait l'unicité, 0138 ne
     garantit plus que l'unicité du couple (élève, professeur). Tout code qui lirait « le »
     professeur actuel afficherait donc l'un des deux au hasard.
     Triées du plus anciennement attribué au plus récent : c'est l'ordre dans lequel l'élève a
     rencontré ses professeurs, le seul qui soit stable d'un écran à l'autre. */
  periodesActuelles: PeriodeProfesseur[]
  /* Les professeurs qui ont RÉELLEMENT donné les séances du dossier, indexés par leur id, pour
     étiqueter chaque séance de son auteur (demande client du 2026-10-27 : « pour chaque séance,
     il faut afficher visuellement le professeur qui a fait la séance »).
     Construit depuis `sessions.teacher_id` et non depuis l'affectation de l'inscription :
     `teacher_assignment_id` est nul pour la seconde d'un binôme duo (0054 : tout vit sur la
     principale) et pour tout élève collectif, alors que `sessions.teacher_id` ne l'est jamais
     (0008). Un professeur supprimé y figure encore, comme ailleurs dans cette vue historique. */
  professeursDesSeances: Record<string, Profile>
  diagnostic: DiagnosticCall | null
  /* Diagnostic du partenaire DUO (0065, demande client du 2026-09-23) : « pour les informations
     qui diffèrent entre les deux personnes... afficher les informations des deux personnes »
     dans le parcours pédagogique. Chaque membre a désormais son propre diagnostic_calls (0060) —
     `null` si l'étudiant n'est pas en duo, ou si son partenaire n'a pas encore de diagnostic. */
  diagnosticPartenaire: DiagnosticCall | null
  packages: Package[]
  /* Vague (cohorte) collectif de l'étudiant, s'il en a une — sinon il est individuel/duo via
     `packages`. Pas de colonne dédiée : la présence d'une inscription à une cohorte suffit à
     distinguer les deux cas. */
  cohorte: Cohort | null
  /* Classe de niveau (0074) au sein de la vague, si l'étudiant y a été affecté — null pour une
     vague legacy sans classes, ou un étudiant pas encore affecté à une classe. */
  cohortClasse: CohortClass | null
  /* Professeur de `cohortClasse`, résolu séparément (voir plus bas) — null tant qu'aucun
     professeur n'est désigné pour la classe, ou pas de classe. */
  professeurClasse: Profile | null
  heuresConsommees: number
  /* Part de ces heures reprise du relevé du professeur à la mise en service (0140) : elles n'ont
     donc aucune séance correspondante dans l'application. Zéro pour un dossier entièrement né
     ici. Affichée pour qu'un parcours bien entamé mais sans séance listée ne passe pas pour un
     compteur faux. */
  heuresReprises: number
  prochaineSeance: SeanceDuParcours | null
  /* DUO (0054) : la personne dont le profil pointe VERS ce dossier (duo_partenaire_id = ce
     studentId), s'il y en a une — ce studentId est alors le « principal » du binôme. `null` si
     cet étudiant n'est pas en duo, ou s'il en est lui-même la « secondaire » (dans ce cas c'est
     son PROPRE profil qui porte duo_partenaire_id, pas ce champ-ci). */
  duoPartenaire: Profile | null
  /* Forfait choisi par le prospect à l'appel diagnostic (0054), tel que repris de `prospects.
     tarif_choisi_id`. Pour individuel/duo, ce choix a déjà donné lieu à un vrai `package` à la
     conversion (voir `packages` ci-dessus) — ce champ ne concerne donc utilement que le
     collectif, où le tarif reste purement indicatif (l'élève est facturé à la main, la vague ne
     porte pas de montant). `null` si le prospect d'origine n'avait rien choisi, ou si l'étudiant
     n'est pas issu du pipeline prospect. */
  tarifChoisi: Tarif | null
}

export function useDossierEtudiant(studentId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(studentId && `dossier-etudiant-${studentId}`, async (): Promise<DossierEtudiant> => {
    // Vague 1 : ces 6 requêtes ne dépendent QUE de `studentId`, déjà connu avant même d'appeler
    // cette fonction — aucune n'a besoin du contenu d'une autre pour partir. `etudiant` était
    // auparavant fetché seul, en séquentiel, avant tout le reste, sans raison : ça ajoutait un
    // aller-retour réseau complet à chaque ouverture d'un dossier.
    const [
      profilsTous,
      { data: affectations },
      { data: enrollments },
      { data: packages },
      { data: resume },
      { data: reprises },
      { data: inscriptionCohorte },
      { data: tousTarifs },
    ] = await Promise.all([
      /* Les profils d'un bloc (optimisation du 2026-10-13) : l'élève, son partenaire DUO, ses
         professeurs et le professeur de sa classe étaient quatre requêtes `profiles` réparties sur
         quatre vagues successives — voir lib/profilsEtablissement.ts. */
      chargerProfilsEtablissement(),
      // Tri secondaire sur created_at : `date_debut` est une date, deux affectations du même
      // jour y sont à égalité et l'ordre serait alors arbitraire.
      supabase
        .from('teacher_assignments')
        .select('*')
        .eq('student_id', studentId as string)
        .order('date_debut', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('session_enrollments').select('*').eq('student_id', studentId as string),
      supabase.from('packages').select('*').eq('student_id', studentId as string).order('created_at', { ascending: false }),
      supabase.from('student_hours_summary').select('*').eq('student_id', studentId as string).maybeSingle(),
      /* Les seules écritures d'heures qui ne viennent pas d'une séance : la reprise du relevé du
         professeur à la mise en service (0140). Le résumé ci-dessus les comprend déjà — celle-ci
         sert uniquement à dire quelle part du compteur n'a pas de séance derrière elle. */
      supabase
        .from('hour_ledger')
        .select('heures')
        .eq('student_id', studentId as string)
        .eq('type_ecriture', 'debit_etudiant')
        .not('package_id', 'is', null),
      supabase.from('cohort_enrollments').select('cohort_id, cohort_class_id').eq('student_id', studentId as string).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      /* Table de référence, quelques lignes : la charger ici évite l'aller-retour séparé que
         demandait le tarif choisi du prospect d'origine, qui ne pouvait partir qu'après lui. */
      supabase.from('tarifs').select('*'),
    ])
    // Un accès direct par URL (l'élève n'apparaît plus dans aucune liste depuis sa suppression,
    // mais son identifiant reste valide) ne doit pas exposer son dossier — demande client du
    // 2026-09-23 : « son espace personnel » fait partie de ce qui doit disparaître.
    const etudiant = profilsTous.find((p) => p.id === studentId)
    if (!etudiant || etudiant.status === 'suspended') throw new Error('Étudiant introuvable.')

    // Un partenaire DUO supprimé ne doit plus apparaître comme second membre du binôme
    // (demande client du 2026-09-23) — sans ce filtre, un compte supprimé continuait à
    // s'afficher dans l'en-tête et les informations personnelles du dossier partagé.
    const duoPartenaire = profilsTous.find((p) => p.duo_partenaire_id === studentId && p.status !== 'suspended') ?? null

    const sessionIds = [...new Set((enrollments ?? []).map((e) => e.session_id))]

    /* Vague 2, la DERNIÈRE depuis le 2026-10-13 : chacune de ces requêtes dépend d'un résultat de
       la vague 1 (inscriptionCohorte, sessionIds ou etudiant.prospect_id), mais jamais du résultat
       d'une autre requête de cette même vague. Les deux vagues qui suivaient — le tarif choisi du
       prospect, puis le professeur de la classe de niveau — se résolvent désormais en mémoire sur
       les tarifs et les profils chargés en vague 1. */
    const [
      { data: cohorte },
      { data: cohortClasse },
      { data: sessions },
      { data: videos },
      { data: diagnostic },
      { data: diagnosticPartenaire },
      { data: prospectTarifRef },
    ] = await Promise.all([
      inscriptionCohorte
        ? supabase.from('cohorts').select('*').eq('id', inscriptionCohorte.cohort_id).maybeSingle()
        : Promise.resolve({ data: null as Cohort | null }),
      inscriptionCohorte?.cohort_class_id
        ? supabase.from('cohort_classes').select('*').eq('id', inscriptionCohorte.cohort_class_id).maybeSingle()
        : Promise.resolve({ data: null as CohortClass | null }),
      sessionIds.length > 0 ? supabase.from('sessions').select('*').in('id', sessionIds) : Promise.resolve({ data: [] as Session[] }),
      sessionIds.length > 0 ? supabase.from('video_sessions').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as VideoSession[] }),
      etudiant.prospect_id
        ? supabase.from('diagnostic_calls').select('*').eq('prospect_id', etudiant.prospect_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null as DiagnosticCall | null }),
      duoPartenaire?.prospect_id
        ? supabase.from('diagnostic_calls').select('*').eq('prospect_id', duoPartenaire.prospect_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null as DiagnosticCall | null }),
      etudiant.prospect_id
        ? supabase.from('prospects').select('tarif_choisi_id').eq('id', etudiant.prospect_id).maybeSingle()
        : Promise.resolve({ data: null as { tarif_choisi_id: string | null } | null }),
    ])
    /* Résolu dans la table de référence déjà chargée (2026-10-13) : c'était un aller-retour de
       plus, qui ne pouvait partir qu'une fois le prospect d'origine connu. `profiles.prospect_id`
       n'a pas de contrainte FK (0002), donc pas d'embed PostgREST profiles -> prospects -> tarifs
       possible en un seul select comme ailleurs dans ce hook. */
    const tarifChoisi = prospectTarifRef?.tarif_choisi_id
      ? ((tousTarifs ?? []).find((t) => t.id === prospectTarifRef.tarif_choisi_id) ?? null)
      : (null as Tarif | null)
    const sessionParId = new Map((sessions ?? []).map((s) => [s.id, s]))
    const videoParSession = new Map((videos ?? []).map((v) => [v.session_id, v]))
    /* Revirement du 2026-10-10 sur une règle posée le 2026-09-23 : le professeur disparaissait
       alors AVEC son nom du parcours pédagogique de l'élève. Demande client explicite et
       inverse — « il faut garder la traçabilité des noms des professeurs dans le suivi
       pédagogique des étudiants [...] sans garder les fonctionnalités du professeur
       supprimé, ce sera juste à titre d'information [...] UNIQUEMENT dans le suivi
       pédagogique des étudiants ». Les professeurs supprimés sont donc gardés ICI SEULEMENT :
       `profiles.nom`/`prenom` ne sont jamais effacés par la suppression (seul `email` l'est, voir
       supprimer-utilisateur.ts). Ce choix ne doit pas se propager à un autre hook — un professeur
       supprimé doit rester invisible de partout où sa fiche pourrait sembler encore active
       (useProfesseurs, sélecteurs d'affectation…), seule cette vue historique fait exception. */
    const professeurParId = new Map(profilsTous.map((p) => [p.id, p]))
    // Professeur de la classe de niveau (0074) : il n'a pas forcément d'affectation individuelle
    // (`teacher_assignments`), c'était donc un aller-retour supplémentaire à lui seul.
    const professeurClasse = cohortClasse?.teacher_id ? (professeurParId.get(cohortClasse.teacher_id) ?? null) : null
    const seancesToutes: SeanceDuParcours[] = (enrollments ?? [])
      .map((enrollment) => {
        const session = sessionParId.get(enrollment.session_id)
        return session
          ? { enrollment, session, video: videoParSession.get(enrollment.session_id) ?? null }
          : null
      })
      .filter((v): v is SeanceDuParcours => v !== null)

    const periodes: PeriodeProfesseur[] = (affectations ?? []).map((affectation) => ({
      affectation,
      professeur: professeurParId.get(affectation.teacher_id) ?? null,
      // Chronologique, de la première séance à la dernière — cohérent avec tous les autres
      // plannings de l'app (voir CalendrierProfesseur.tsx, SeancesAdmin.tsx).
      seances: seancesToutes
        .filter((s) => s.enrollment.teacher_assignment_id === affectation.id)
        .sort((a, b) => a.session.debut.localeCompare(b.session.debut)),
    }))

    /* Séances suivies SANS affectation individuelle — celles d'une classe de niveau (0074) :
       l'élève y est inscrit par sa classe, pas par un `teacher_assignments`, donc leur
       `teacher_assignment_id` est nul et aucune des périodes ci-dessus ne les réclame. Sans ce
       champ, le dossier d'un élève collectif n'affichait AUCUNE séance : « Aucune séance
       enregistrée » alors qu'il suivait son cursus normalement (demande client du 2026-10-19 :
       « il faudrait que tous les étudiants en cours collectifs soient visibles dans la section
       Étudiants afin de bien suivre l'étudiant en cours collectif »).

       Le rattachement se fait par l'absence d'affectation plutôt que par `sessions.type` : une
       séance collective reste collective même si l'élève a eu un professeur individuel par
       ailleurs, et c'est bien le lien d'inscription qui décide de qui l'a planifiée. */
    const seancesCollectives = seancesHorsAffectation(
      seancesToutes,
      (affectations ?? []).map((a) => a.id),
    ).sort((a, b) => a.session.debut.localeCompare(b.session.debut))

    const professeursDesSeances: Record<string, Profile> = {}
    for (const { session } of seancesToutes) {
      const professeur = professeurParId.get(session.teacher_id)
      if (professeur) professeursDesSeances[session.teacher_id] = professeur
    }

    const maintenant = new Date().toISOString()
    const prochaineSeance =
      seancesToutes
        .filter((s) => s.session.statut === 'planifiee' && s.session.debut >= maintenant)
        .sort((a, b) => a.session.debut.localeCompare(b.session.debut))[0] ?? null

    return {
      etudiant,
      periodes,
      seancesCollectives,
      professeursDesSeances,
      periodesActuelles: periodes
        .filter((p) => !p.affectation.date_fin)
        .sort(
          (a, b) =>
            a.affectation.date_debut.localeCompare(b.affectation.date_debut) ||
            a.affectation.created_at.localeCompare(b.affectation.created_at),
        ),
      diagnostic,
      diagnosticPartenaire: diagnosticPartenaire ?? null,
      packages: packages ?? [],
      cohorte: cohorte ?? null,
      cohortClasse: cohortClasse ?? null,
      professeurClasse: professeurClasse ?? null,
      heuresConsommees: resume?.heures_consommees ?? 0,
      heuresReprises: (reprises ?? []).reduce((total, r) => total + Number(r.heures), 0),
      prochaineSeance,
      duoPartenaire: duoPartenaire ?? null,
      tarifChoisi: tarifChoisi ?? null,
    }
    // Filet de sécurité (couche 3 de la stratégie temps réel du 2026-09-29) : voir le
    // commentaire d'en-tête de useCacheRequete.ts.
  }, { intervalleSondageMs: 25_000 })

  return { dossier: valeur ?? null, loading, erreur, recharger }
}
