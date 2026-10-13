import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { chargerProfilsEtablissement } from '../lib/profilsEtablissement'
import { useCacheRequete } from './useCacheRequete'
import { inscriptionsVisibles } from '../lib/seances'

type Session = Database['public']['Tables']['sessions']['Row']
type SessionEnrollment = Database['public']['Tables']['session_enrollments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']
type Cohort = Database['public']['Tables']['cohorts']['Row']

export interface SeanceProfesseur {
  session: Session
  inscriptions: (SessionEnrollment & { etudiant: Profile | null })[]
  video: VideoSession | null
}

export interface EtudiantAncien {
  profil: Profile
  transfereLe: string
}

interface CalendrierProfesseur {
  seances: SeanceProfesseur[]
  etudiantsActifs: Profile[]
  /* Élèves transférés à un autre professeur (demande client du 2026-09-17) : approche additive,
     PAS une liste unifiée avec un champ statut — `etudiantsActifs` a 3 autres consommateurs
     (CalendrierProfesseur.tsx, PlanningPrevisionnelProfesseur.tsx, DocumentsProfesseur.tsx) qui
     doivent continuer à EXCLURE les anciens élèves pour planifier/afficher des documents ; une
     forme unifiée casserait silencieusement ce filtrage si le champ n'était pas repris partout. */
  etudiantsAnciens: EtudiantAncien[]
  /* Vagues collectif que ce professeur anime (0069), avec leurs inscrits : elles n'apparaissent
     pas dans `teacher_assignments`, un élève de vague n'ayant pas d'affectation individuelle. */
  vagues: { cohorte: Cohort; eleves: Profile[] }[]
  heuresEnseignees: number
}

export function useCalendrierProfesseur(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(teacherId && `calendrier-professeur-${teacherId}`, async (): Promise<CalendrierProfesseur> => {
    /* TOUT part ensemble (optimisation du 2026-10-13). Ce hook enchaînait cinq vagues de requêtes
       — séances/affectations/vagues, puis les inscrits de ces vagues, puis les inscriptions et
       visios de ces séances, puis les profils de toutes ces personnes, puis leurs partenaires de
       binôme — chacune ne pouvant partir qu'une fois la précédente revenue. Un aller-retour coûte
       ici 330 ms au mieux (base en Europe, utilisateurs à Madagascar), donc c'est leur NOMBRE qui
       faisait l'attente, pas le volume.
       Les trois tables de détail ne sont plus filtrées par identifiant : leurs policies de 0009 et
       0069 les bornent déjà à CE professeur, et le filtrage en mémoire ci-dessous reste en place
       pour que le résultat soit identique quelle que soit l'étendue réellement lisible. */
    const [
      { data: sessions, error: sessionsError },
      { data: affectations },
      { data: resumeHeures },
      { data: vagues },
      { data: toutesInscriptionsVagues },
      { data: tousEnrollments },
      { data: tousVideos },
      profilsTous,
    ] = await Promise.all([
      supabase.from('sessions').select('*').eq('teacher_id', teacherId as string).order('debut', { ascending: false }),
      // Tout l'historique, actives ET closes (pas de .is('date_fin', null)) : profils_teacher_
      // select_students (0017) n'a jamais filtré sur date_fin, un ancien élève reste lisible par
      // l'ancien professeur indéfiniment — nécessaire pour construire etudiantsAnciens ci-dessous.
      supabase.from('teacher_assignments').select('*').eq('teacher_id', teacherId as string),
      supabase.from('teacher_hours_summary').select('*').eq('teacher_id', teacherId as string).maybeSingle(),
      supabase.from('cohorts').select('*').eq('teacher_id', teacherId as string).order('date_debut', { ascending: false }),
      supabase.from('cohort_enrollments').select('cohort_id, student_id'),
      supabase.from('session_enrollments').select('*'),
      supabase.from('video_sessions').select('*'),
      /* Les profils lisibles par ce professeur, d'un bloc : ses élèves affectés (0017), ses
         secondaires DUO (0064/0067), ses élèves de vague (0069) et de classe (0074). C'est
         exactement l'union de ce que les quatre requêtes filtrées supprimées cherchaient — la RLS
         décide du périmètre, pas le filtre côté client. */
      chargerProfilsEtablissement(),
    ])
    if (sessionsError) throw new Error(sessionsError.message)

    const vagueIds = new Set((vagues ?? []).map((v) => v.id))
    const inscriptionsVagues = (toutesInscriptionsVagues ?? []).filter((i) => vagueIds.has(i.cohort_id))

    const sessionIds = new Set((sessions ?? []).map((s) => s.id))
    const enrollments = (tousEnrollments ?? []).filter((e) => sessionIds.has(e.session_id))
    const videos = (tousVideos ?? []).filter((v) => sessionIds.has(v.session_id))

    // Un élève supprimé (soft-delete) garde son `teacher_assignments`/`session_enrollments`
    // historique — sans ce filtre il continuait à apparaître comme élève actif (ou ancien élève)
    // du professeur alors que son compte n'existe plus (demande client du 2026-09-23).
    const etudiantParId = new Map(profilsTous.filter((p) => p.status !== 'suspended').map((e) => [e.id, e]))
    const videoParSession = new Map((videos ?? []).map((v) => [v.session_id, v]))

    // Regroupe par élève : actif si au moins une affectation active avec CE professeur (prime
    // toujours, y compris si l'élève a AUSSI une ou plusieurs périodes closes avec lui — cas
    // d'un élève revenu après un transfert). Sinon ancien, avec la date de fin la plus récente.
    const parEtudiant = new Map<string, { actif: boolean; derniereFin: string | null }>()
    for (const a of affectations ?? []) {
      const entree = parEtudiant.get(a.student_id) ?? { actif: false, derniereFin: null }
      if (a.date_fin === null) entree.actif = true
      else if (!entree.derniereFin || a.date_fin > entree.derniereFin) entree.derniereFin = a.date_fin
      parEtudiant.set(a.student_id, entree)
    }

    /* Le partenaire DUO d'un élève actuellement actif (ou de vague) du professeur — demande
       client du 2026-09-23 : « tous les étudiants formant un DUO devraient être retrouvables »
       lors de la recherche pour planifier une séance, avec le même mécanisme de proposition
       automatique que l'agenda admin (voir SelecteurPersonnes.tsx / lib/invitations.ts). Un
       secondaire DUO n'a ni affectation ni séance propre (tout vit sur le principal, 0054) :
       sans cette résolution, il n'apparaît JAMAIS dans `etudiantsActifs` et reste donc
       introuvable même tapé lettre à lettre — pas seulement « non proposé en second ». Bornée
       aux élèves ACTIFS/de vague (pas tout `studentIds`, qui inclut aussi d'anciens élèves) :
       le partenaire d'un ancien élève n'a pas sa place dans le formulaire de planification
       actuel. Les deux sens du lien DUO sont couverts (0054 : lien asymétrique). */
    const idsActifsEtVague = [
      ...[...parEtudiant.entries()].filter(([, e]) => e.actif).map(([id]) => id),
      ...(inscriptionsVagues ?? []).map((i) => i.student_id),
    ]
    /* Résolu en mémoire sur les profils déjà chargés (optimisation du 2026-10-13) : c'étaient deux
       requêtes de plus, et surtout une vague d'attente supplémentaire puisqu'elles ne pouvaient
       partir qu'une fois les élèves actifs connus. Les deux sens sont couverts comme avant — les
       profils suspendus sont écartés puisque `etudiantParId` ne les contient pas. */
    const actifsEtVague = new Set(idsActifsEtVague)
    const partenairesDuo = [
      // Le principal désigné par un élève actif qui est, lui, le membre secondaire du binôme.
      ...idsActifsEtVague.map((id) => {
        const designe = etudiantParId.get(id)?.duo_partenaire_id
        return designe ? etudiantParId.get(designe) : undefined
      }),
      // Le secondaire qui pointe vers un élève actif — sens inverse, le principal ne porte rien.
      ...profilsTous.filter((p) => p.duo_partenaire_id && actifsEtVague.has(p.duo_partenaire_id) && etudiantParId.has(p.id)),
    ].filter((p): p is Profile => !!p)

    return {
      seances: (sessions ?? []).flatMap((session) => {
        const inscriptions = (enrollments ?? [])
          .filter((e) => e.session_id === session.id)
          .map((e) => ({ ...e, etudiant: etudiantParId.get(e.student_id) ?? null }))
        const visibles = inscriptionsVisibles(inscriptions)
        if (!visibles) return []
        return [{ session, inscriptions: visibles, video: videoParSession.get(session.id) ?? null }]
      }),
      /* Dédupliqué par élève, pas par affectation : cette liste alimente « Mes étudiants » et
         les pastilles de sélection du formulaire de planification, où un même nom ne doit
         jamais apparaître deux fois. La migration 0039 interdit désormais deux affectations
         actives pour un même élève, mais la liste ne doit pas dépendre de cette garantie pour
         rester correcte. */
      /* Les élèves de vague comptent parmi les élèves actifs du professeur : ils n'ont pas
         d'affectation individuelle, mais c'est bien lui qui les accompagne (0069). */
      etudiantsActifs: [
        ...new Map(
          [
            ...[...parEtudiant.entries()]
              .filter(([, e]) => e.actif)
              .map(([studentId]) => etudiantParId.get(studentId)),
            ...(inscriptionsVagues ?? []).map((i) => etudiantParId.get(i.student_id)),
            ...partenairesDuo,
          ]
            .filter((e): e is Profile => !!e)
            .map((e) => [e.id, e]),
        ).values(),
      ],
      etudiantsAnciens: [...parEtudiant.entries()]
        .filter(([, e]) => !e.actif && e.derniereFin)
        .map(([studentId, e]) => {
          const profil = etudiantParId.get(studentId)
          return profil ? { profil, transfereLe: e.derniereFin as string } : null
        })
        .filter((e): e is EtudiantAncien => e !== null),
      vagues: (vagues ?? []).map((cohorte) => ({
        cohorte,
        eleves: (inscriptionsVagues ?? [])
          .filter((i) => i.cohort_id === cohorte.id)
          .map((i) => etudiantParId.get(i.student_id))
          .filter((e): e is Profile => !!e),
      })),
      heuresEnseignees: resumeHeures?.heures_enseignees ?? 0,
    }
    // Filet de sécurité (couche 3 de la stratégie temps réel du 2026-09-29) : une modification
    // faite par l'admin déclenche déjà une notification (voir CalendrierProfesseur.tsx, couche
    // 2), ce sondage couvre le reste (ex. un élève supprimé qui libère une séance).
  }, { intervalleSondageMs: 25_000 })

  return {
    seances: valeur?.seances ?? [],
    etudiantsActifs: valeur?.etudiantsActifs ?? [],
    etudiantsAnciens: valeur?.etudiantsAnciens ?? [],
    vagues: valeur?.vagues ?? [],
    heuresEnseignees: valeur?.heuresEnseignees ?? 0,
    loading,
    erreur,
    recharger,
  }
}
