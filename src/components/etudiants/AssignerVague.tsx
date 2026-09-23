import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCohortes } from '../../hooks/useCohortes'
import { useCohortClasses } from '../../hooks/useCohortClasses'
import { categorieDepuisNiveauEstime, LABEL_NIVEAU_CLASSE, LABEL_CRENEAU_CLASSE } from '../../lib/classesCollectif'
import type { Database, NiveauClasse } from '../../types/database.types'

type Cohort = Database['public']['Tables']['cohorts']['Row']

interface AssignerVagueProps {
  studentId: string
  etablissementId: string
  vagueActuelle: Cohort | null
  /* Utilisé depuis ChoixProgrammeInitial : le formulaire s'ouvre directement, sans passer par
     le bouton déclencheur (déjà "consommé" par le choix du programme collectif en amont). */
  ouvertParDefaut?: boolean
  onTermine: () => void
}

/* Niveau détecté du candidat, dérivé du dernier quiz de positionnement passé (0074) — sert
   uniquement à présélectionner la classe la plus probable, jamais à ressaisir le niveau. Renvoie
   `null` sans erreur si le profil n'a pas de prospect d'origine ou de test passé. */
function useNiveauDetecte(studentId: string): NiveauClasse | null {
  const [niveau, setNiveau] = useState<NiveauClasse | null>(null)

  useEffect(() => {
    let annule = false
    async function charger() {
      const { data: profil } = await supabase.from('profiles').select('prospect_id').eq('id', studentId).maybeSingle()
      if (!profil?.prospect_id) return
      const { data: inscription } = await supabase
        .from('test_positionnement_inscriptions')
        .select('niveau_estime')
        .eq('prospect_id', profil.prospect_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!annule) setNiveau(categorieDepuisNiveauEstime(inscription?.niveau_estime ?? null))
    }
    charger()
    return () => {
      annule = true
    }
  }, [studentId])

  return niveau
}

export function AssignerVague({ studentId, etablissementId, vagueActuelle, ouvertParDefaut, onTermine }: AssignerVagueProps) {
  const { cohortes, loading: chargementCohortes } = useCohortes()
  const [ouvert, setOuvert] = useState(!!ouvertParDefaut)
  const [cohortId, setCohortId] = useState('')
  const [cohortClassId, setCohortClassId] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { classes, loading: chargementClasses } = useCohortClasses(cohortId || null)
  const niveauDetecte = useNiveauDetecte(studentId)

  /* Présélectionne la classe du niveau détecté dès que la liste des classes de la promotion
     choisie est connue — l'admin reste libre de la changer manuellement. */
  useEffect(() => {
    if (!cohortId || chargementClasses || cohortClassId) return
    if (!niveauDetecte) return
    const suggestion = classes.find((c) => c.niveau === niveauDetecte)
    if (suggestion) setCohortClassId(suggestion.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId, chargementClasses, classes, niveauDetecte])

  function choisirCohort(valeur: string) {
    setCohortId(valeur)
    setCohortClassId('')
  }

  async function assigner() {
    if (!cohortId) return
    setEnCours(true)
    setErreur(null)

    const champs = { cohort_id: cohortId, cohort_class_id: cohortClassId || null }
    const { error } = vagueActuelle
      ? await supabase.from('cohort_enrollments').update(champs).eq('cohort_id', vagueActuelle.id).eq('student_id', studentId)
      : await supabase.from('cohort_enrollments').insert({ etablissement_id: etablissementId, student_id: studentId, ...champs })

    setEnCours(false)
    if (error) {
      // Les refus de capacité (7 élèves max) et de changement de promotion (heures déjà
      // consommées) viennent des triggers de la migration 0074 : leur message est déjà rédigé
      // pour l'admin, on l'affiche tel quel.
      setErreur(error.message)
      return
    }
    setOuvert(false)
    setCohortId('')
    setCohortClassId('')
    onTermine()
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="btn-shine" style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-blue-gradient)', color: '#fff' }}>
        {vagueActuelle ? 'Changer de vague' : 'Assigner une vague'}
      </button>
    )
  }

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontSize: 14, color: 'var(--accent-gold, #e9cf94)' }}>{vagueActuelle ? 'Changer de vague' : 'Assigner une vague'}</h3>
      {cohortes.length === 0 && !chargementCohortes && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Aucune vague paramétrée — crée-en une depuis « Vagues ».</p>
      )}
      <select
        value={cohortId}
        onChange={(e) => choisirCohort(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      >
        <option value="">{chargementCohortes ? 'Chargement…' : 'Choisir une promotion'}</option>
        {cohortes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom} · {new Date(c.date_debut).toLocaleDateString('fr-FR')} → {new Date(c.date_fin).toLocaleDateString('fr-FR')}
          </option>
        ))}
      </select>

      {cohortId && (
        <select
          value={cohortClassId}
          onChange={(e) => setCohortClassId(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        >
          <option value="">
            {chargementClasses ? 'Chargement des classes…' : classes.length === 0 ? 'Aucune classe créée pour l’instant' : 'Aucune classe (à régulariser plus tard)'}
          </option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {LABEL_NIVEAU_CLASSE[c.niveau]}
              {c.nom ? ` — ${c.nom}` : ''} · {LABEL_CRENEAU_CLASSE[c.creneau]}
              {niveauDetecte === c.niveau ? ' (niveau détecté)' : ''}
            </option>
          ))}
        </select>
      )}

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        {!ouvertParDefaut && (
          <button onClick={() => setOuvert(false)} style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
            Annuler
          </button>
        )}
        <button
          onClick={assigner}
          disabled={!cohortId || enCours}
          className="btn-shine"
          style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-blue-gradient)', color: '#fff', opacity: !cohortId || enCours ? 0.6 : 1 }}
        >
          Confirmer
        </button>
      </div>
    </div>
  )
}
