import { useEffect, useState } from 'react'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useClassesAvecMembres } from '../../hooks/useClassesAvecMembres'
import { supabase } from '../../lib/supabaseClient'
import { LABEL_NIVEAU_CLASSE, LABEL_CRENEAU_CLASSE } from '../../lib/classesCollectif'
import { initiales } from '../etudiants/DossierEtudiantVue'
import { PlanifierSeancesForfait } from '../etudiants/PlanifierSeancesForfait'
import type { Database } from '../../types/database.types'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
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
  const [elevesParClasse, setElevesParClasse] = useState<Map<string, Profile[]>>(new Map())
  const [classeDepliee, setClasseDepliee] = useState<string | null>(null)

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
        description="Les classes de niveau que l'administration vous a attribuées, et les élèves qui s'y trouvent."
      />

      <GuidePage
        id="professeur-cours-collectifs"
        etapes={[
          <>
            Chaque classe correspond à un niveau (Beginner/Intermediate/Advanced) au sein d'une promotion, avec un
            créneau horaire qui lui est propre.
          </>,
          <>
            <strong>Planning de la classe</strong> génère d'un coup toutes les séances récurrentes du groupe —
            exactement comme pour un élève individuel.
          </>,
          <>
            La composition de la classe (élèves, créneau) est gérée par l'administration depuis sa page Cours
            collectifs.
          </>,
        ]}
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
            return (
              <div key={c.classe.id} className="card card-lift" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flexGrow: 1, minWidth: 200 }}>
                    <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
                      {LABEL_NIVEAU_CLASSE[c.classe.niveau]}
                      {c.classe.nom ? ` — ${c.classe.nom}` : ''}
                    </span>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {c.cohorte?.nom ?? 'Promotion inconnue'} · {LABEL_CRENEAU_CLASSE[c.classe.creneau]} · {eleves.length} élève
                      {eleves.length > 1 ? 's' : ''}
                    </div>
                  </div>
                  <button onClick={() => setClasseDepliee(depliee ? null : c.classe.id)} style={boutonSecondaireStyle}>
                    {depliee ? 'Masquer le planning' : 'Planning de la classe'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {eleves.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>Aucun élève inscrit pour l'instant.</p>
                  ) : (
                    eleves.map((etudiant) => (
                      <div key={etudiant.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 999,
                            background: 'rgba(255,255,255,.06)',
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
                    <PlanifierSeancesForfait
                      studentIds={eleves.map((e) => e.id)}
                      cohortClassId={c.classe.id}
                      endpoint="/api/professeur/planifier-seances-prevision"
                      dateFinParDefaut={c.cohorte?.date_fin}
                      titre={`Planning prévisionnel · ${LABEL_NIVEAU_CLASSE[c.classe.niveau]}${c.classe.nom ? ` — ${c.classe.nom}` : ''}`}
                      onCree={() => {}}
                    />
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>Aucun élève à planifier pour l'instant.</p>
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </ProfesseurLayout>
  )
}
