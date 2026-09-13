import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCohortes } from '../../hooks/useCohortes'
import type { Database } from '../../types/database.types'

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

export function AssignerVague({ studentId, etablissementId, vagueActuelle, ouvertParDefaut, onTermine }: AssignerVagueProps) {
  const { cohortes, loading: chargementCohortes } = useCohortes()
  const [ouvert, setOuvert] = useState(!!ouvertParDefaut)
  const [cohortId, setCohortId] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function assigner() {
    if (!cohortId) return
    setEnCours(true)
    setErreur(null)

    if (vagueActuelle) {
      const { error } = await supabase
        .from('cohort_enrollments')
        .delete()
        .eq('cohort_id', vagueActuelle.id)
        .eq('student_id', studentId)
      if (error) {
        setErreur(error.message)
        setEnCours(false)
        return
      }
    }

    const { error: insertError } = await supabase.from('cohort_enrollments').insert({
      etablissement_id: etablissementId,
      cohort_id: cohortId,
      student_id: studentId,
    })
    setEnCours(false)
    if (insertError) {
      setErreur(insertError.message)
      return
    }
    setOuvert(false)
    setCohortId('')
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
        onChange={(e) => setCohortId(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      >
        <option value="">{chargementCohortes ? 'Chargement…' : 'Choisir une vague'}</option>
        {cohortes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom} · {new Date(c.date_debut).toLocaleDateString('fr-FR')} → {new Date(c.date_fin).toLocaleDateString('fr-FR')}
          </option>
        ))}
      </select>
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
