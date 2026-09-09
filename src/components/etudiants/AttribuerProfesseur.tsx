import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import type { Database } from '../../types/database.types'

type TeacherAssignment = Database['public']['Tables']['teacher_assignments']['Row']

interface AttribuerProfesseurProps {
  studentId: string
  etablissementId: string
  affectationActuelle: TeacherAssignment | null
  onTermine: () => void
}

export function AttribuerProfesseur({ studentId, etablissementId, affectationActuelle, onTermine }: AttribuerProfesseurProps) {
  const { professeurs, loading: chargementProfs } = useProfesseurs()
  const [ouvert, setOuvert] = useState(false)
  const [teacherId, setTeacherId] = useState('')
  const [langue, setLangue] = useState('')
  const [motif, setMotif] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function attribuer() {
    if (!teacherId) return
    setEnCours(true)
    setErreur(null)
    const aujourdhui = new Date().toISOString().slice(0, 10)

    if (affectationActuelle) {
      const { error } = await supabase
        .from('teacher_assignments')
        .update({ date_fin: aujourdhui, motif_changement: motif || null })
        .eq('id', affectationActuelle.id)
      if (error) {
        setErreur(error.message)
        setEnCours(false)
        return
      }
    }

    const { error: insertError } = await supabase.from('teacher_assignments').insert({
      etablissement_id: etablissementId,
      student_id: studentId,
      teacher_id: teacherId,
      langue: langue || null,
      date_debut: aujourdhui,
      motif_changement: affectationActuelle ? motif || null : null,
    })
    setEnCours(false)
    if (insertError) {
      setErreur(insertError.message)
      return
    }
    setOuvert(false)
    setTeacherId('')
    setLangue('')
    setMotif('')
    onTermine()
  }

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="btn-shine"
        style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-blue-gradient)', color: '#fff' }}
      >
        {affectationActuelle ? 'Changer de professeur' : 'Attribuer un professeur'}
      </button>
    )
  }

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontSize: 14, color: 'var(--accent-gold, #e9cf94)' }}>
        {affectationActuelle ? 'Changer de professeur' : 'Attribuer un professeur'}
      </h3>
      <select
        value={teacherId}
        onChange={(e) => setTeacherId(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      >
        <option value="">{chargementProfs ? 'Chargement…' : 'Choisir un professeur'}</option>
        {professeurs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.prenom} {p.nom}
          </option>
        ))}
      </select>
      <input
        placeholder="Langue (ex. Anglais)"
        value={langue}
        onChange={(e) => setLangue(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      />
      {affectationActuelle && (
        <input
          placeholder="Motif du changement"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        />
      )}
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setOuvert(false)}
          style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}
        >
          Annuler
        </button>
        <button
          onClick={attribuer}
          disabled={!teacherId || enCours}
          className="btn-shine"
          style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-blue-gradient)', color: '#fff', opacity: !teacherId || enCours ? 0.6 : 1 }}
        >
          Confirmer
        </button>
      </div>
    </div>
  )
}
