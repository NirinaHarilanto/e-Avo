import { useEffect, useState } from 'react'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useClassesAvecMembres } from '../../hooks/useClassesAvecMembres'
import { supabase } from '../../lib/supabaseClient'
import { LABEL_NIVEAU_CLASSE, libelleCreneau, COULEUR_NIVEAU_CLASSE, periodeClasse, seancesRestantesClasse } from '../../lib/classesCollectif'
import { useCreneauxClasses } from '../../hooks/useCreneauxClasses'
import { initiales } from '../etudiants/DossierEtudiantVue'
import { TagAucunCoursPlanifie } from '../etudiants/CarteListeEtudiant'
import { PanneauPlanningClasse } from '../shared/PanneauPlanningClasse'
import type { Database } from '../../types/database.types'
import { EnTetePage } from '../ui/EnTetePage'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement } from '../ui/Etats'
import { boutonSecondaireStyle } from '../ui/Boutons'

type Profile = Database['public']['Tables']['profiles']['Row']

/* Pendant, côté professeur, de la section « Classes de niveau » de CohortesAdmin.tsx (demande
   client du 2026-09-24) : suivre les classes de cours collectif qui lui ont été attribuées et
   leurs élèves, en lecture seule — la composition d'une classe (niveau, créneau, professeur,
   élèves) reste une décision administrative (CohortesAdmin.tsx, AssignerVague.tsx). Seule action
   laissée au professeur : planifier les séances récurrentes de sa classe, exactement comme pour
   un élève individuel (PlanningPrevisionnelProfesseur.tsx).

   `useClassesAvecMembres()` ne fait aucun filtre par professeur : c'est la RLS
   (`cohort_classes_teacher_select`, 0074) qui ne renvoie déjà que les classes dont il est
   `teacher_id` — comme `useVagues()` le fait pour les vagues legacy. */
export function CoursCollectifsProfesseur() {
  const { classes, loading } = useClassesAvecMembres()
  const { creneaux: creneauxClasses } = useCreneauxClasses()
  const [elevesParClasse, setElevesParClasse] = useState<Map<string, Profile[]>>(new Map())
  const [classeDepliee, setClasseDepliee] = useState<string | null>(null)
  /* Classes sans aucun cours à venir (0074, demande client du 2026-10-30) — même alerte que côté
     admin (CohortesAdmin.tsx), avec le même critère : une « planifiee » déjà passée n'en est pas
     une (elle attend une clôture, voir le commentaire jumeau côté admin). */
  const [classesAvecSeanceAVenir, setClassesAvecSeanceAVenir] = useState<Set<string>>(new Set())
  /* Séances restantes sur le forfait, par classe — demande client du 2026-10-30, capture à
     l'appui : « il faudrait afficher les séances restantes pour les cours collectifs », visible
     directement sur la ligne de la classe, sans avoir à ouvrir son planning. Même calcul, même
     wording que le badge posé le même jour dans le pop-up Planning (PanneauPlanningClasse.tsx) :
     une « planifiee » ou une « terminee » consomme une séance du forfait, une « annulée » ou une
     « reportée » non. Un professeur de classe collective enseigne par séances d'une heure
     (convention de l'établissement) : le compte de séances se lit directement sur le forfait en
     HEURES, sans conversion. */
  const [seancesRestantesParClasse, setSeancesRestantesParClasse] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    let annule = false
    async function charger() {
      const classeIds = classes.map((c) => c.classe.id)
      if (classeIds.length === 0) {
        setClassesAvecSeanceAVenir(new Set())
        setSeancesRestantesParClasse(new Map())
        return
      }
      const [{ data: aVenir }, { data: toutes }] = await Promise.all([
        supabase
          .from('sessions')
          .select('cohort_class_id')
          .in('cohort_class_id', classeIds)
          .eq('statut', 'planifiee')
          .gte('debut', new Date().toISOString()),
        supabase.from('sessions').select('cohort_class_id, statut').in('cohort_class_id', classeIds),
      ])
      if (annule) return
      setClassesAvecSeanceAVenir(new Set((aVenir ?? []).map((s) => s.cohort_class_id).filter((id): id is string => !!id)))

      const seancesParClasse = new Map<string, { statut: string }[]>()
      for (const s of toutes ?? []) {
        if (!s.cohort_class_id) continue
        const liste = seancesParClasse.get(s.cohort_class_id) ?? []
        liste.push(s)
        seancesParClasse.set(s.cohort_class_id, liste)
      }
      const restantesParClasse = new Map<string, number>()
      for (const c of classes) {
        restantesParClasse.set(
          c.classe.id,
          seancesRestantesClasse(seancesParClasse.get(c.classe.id) ?? [], c.cohorte?.heures_forfait ?? 32),
        )
      }
      setSeancesRestantesParClasse(restantesParClasse)
    }
    charger()
    return () => {
      annule = true
    }
  }, [classes])

  useEffect(() => {
    let annule = false
    async function charger() {
      const ids = [...new Set(classes.flatMap((c) => c.membreIds))]
      if (ids.length === 0) {
        setElevesParClasse(new Map())
        return
      }
      const { data } = await supabase.from('profiles').select('*').in('id', ids).neq('status', 'suspended')
      if (annule) return
      const parId = new Map((data ?? []).map((p) => [p.id, p]))
      const map = new Map<string, Profile[]>()
      for (const c of classes) {
        map.set(
          c.classe.id,
          c.membreIds.map((id) => parId.get(id)).filter((p): p is Profile => !!p),
        )
      }
      setElevesParClasse(map)
    }
    charger()
    return () => {
      annule = true
    }
  }, [classes])

  return (
    <ProfesseurLayout actif="Cours collectifs">
      <EnTetePage
        titre="Cours collectifs"
      />

      {loading ? (
        <EtatChargement lignes={3} hauteur={90} />
      ) : classes.length === 0 ? (
        <EtatVide
          icone="vagues"
          titre="Aucune classe attribuée"
          description="L'administration ne vous a pas encore désigné comme professeur d'une classe de cours collectif."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {classes.map((c) => {
            const eleves = elevesParClasse.get(c.classe.id) ?? []
            const depliee = classeDepliee === c.classe.id
            const periode = periodeClasse(c.classe)
            return (
              <div key={c.classe.id} className="card card-lift" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flexGrow: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 800,
                          letterSpacing: 0.2,
                          color: COULEUR_NIVEAU_CLASSE[c.classe.niveau],
                          background: `color-mix(in srgb, ${COULEUR_NIVEAU_CLASSE[c.classe.niveau]} 16%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${COULEUR_NIVEAU_CLASSE[c.classe.niveau]} 42%, transparent)`,
                          borderRadius: 999,
                          padding: '2px 10px',
                        }}
                      >
                        {LABEL_NIVEAU_CLASSE[c.classe.niveau]}
                      </span>
                      {periode && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{periode}</span>}
                      {c.classe.nom && (
                        <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
                          {c.classe.nom}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {c.cohorte?.nom ?? 'Promotion inconnue'} · {libelleCreneau(creneauxClasses, c.classe.creneau)} · {eleves.length} étudiant
                      {eleves.length > 1 ? 's' : ''}
                    </div>
                  </div>
                  {!classesAvecSeanceAVenir.has(c.classe.id) && (
                    <TagAucunCoursPlanifie
                      texte={false}
                      titre="Aucune séance à venir pour cette classe. Les séances déjà passées, clôturées ou non, ne comptent pas ici."
                    />
                  )}
                  {seancesRestantesParClasse.has(c.classe.id) &&
                    (() => {
                      const forfait = c.cohorte?.heures_forfait ?? 32
                      const restantes = seancesRestantesParClasse.get(c.classe.id)!
                      return (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: restantes <= 0 ? 'var(--danger)' : 'var(--accent-teal)',
                            background: restantes <= 0 ? 'rgba(255,138,112,.12)' : 'rgba(111,227,192,.14)',
                            border: `1px solid ${restantes <= 0 ? 'rgba(255,138,112,.3)' : 'rgba(111,227,192,.3)'}`,
                            borderRadius: 999,
                            padding: '3px 10px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {restantes <= 0 ? 'Forfait épuisé' : `${restantes} séance${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''} sur ${forfait}`}
                        </span>
                      )
                    })()}
                  <button onClick={() => setClasseDepliee(depliee ? null : c.classe.id)} style={boutonSecondaireStyle}>
                    {depliee ? 'Masquer le planning' : 'Planning de la classe'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {eleves.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>Aucun étudiant inscrit pour l'instant.</p>
                  ) : (
                    eleves.map((etudiant) => (
                      <div key={etudiant.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 999,
                            background: 'var(--voile, rgba(255,255,255,.06))',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent-blue)',
                            fontSize: 9.5,
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          {initiales(etudiant)}
                        </span>
                        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                          {etudiant.prenom} {etudiant.nom}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {depliee &&
                  (eleves.length > 0 ? (
                    <PanneauPlanningClasse
                      studentIds={eleves.map((e) => e.id)}
                      cohortClassId={c.classe.id}
                      endpoint="/api/professeur/planifier-seances-prevision"
                      dateFinParDefaut={c.cohorte?.date_fin}
                      heuresForfait={c.cohorte?.heures_forfait ?? 32}
                      titre={`Planning prévisionnel · ${LABEL_NIVEAU_CLASSE[c.classe.niveau]}${c.classe.nom ? ` — ${c.classe.nom}` : ''}`}
                      peutModifier
                    />
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>Aucun étudiant à planifier pour l'instant.</p>
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </ProfesseurLayout>
  )
}
