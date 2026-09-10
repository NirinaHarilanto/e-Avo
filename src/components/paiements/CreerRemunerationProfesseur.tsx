import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { supabase } from '../../lib/supabaseClient'

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
}

interface CreerRemunerationProfesseurProps {
  etablissementId: string
  onCree: () => void
  onAnnuler: () => void
}

export function CreerRemunerationProfesseur({ etablissementId, onCree, onAnnuler }: CreerRemunerationProfesseurProps) {
  const { profile } = useProfileContext()
  const { professeurs } = useProfesseurs()
  const [teacherId, setTeacherId] = useState('')
  const [montant, setMontant] = useState('')
  const [periodeDebut, setPeriodeDebut] = useState('')
  const [periodeFin, setPeriodeFin] = useState('')
  const [dateEcheance, setDateEcheance] = useState('')
  const [reference, setReference] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!profile || !teacherId || !montant) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('teacher_payments').insert({
      etablissement_id: etablissementId,
      teacher_id: teacherId,
      montant: Number(montant),
      periode_debut: periodeDebut || null,
      periode_fin: periodeFin || null,
      date_echeance: dateEcheance || null,
      reference: reference || null,
      created_by_profile_id: profile.id,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onCree()
  }

  return (
    <form onSubmit={creer} className="card" style={{ padding: 18, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Professeur</label>
        <select required value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={champStyle}>
          <option value="">Sélectionner…</option>
          {professeurs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.prenom} {p.nom}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 130 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Montant (€)</label>
        <input required type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 150 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Période du</label>
        <input type="date" value={periodeDebut} onChange={(e) => setPeriodeDebut(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 150 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>au</label>
        <input type="date" value={periodeFin} onChange={(e) => setPeriodeFin(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Échéance</label>
        <input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Référence</label>
        <input value={reference} onChange={(e) => setReference(e.target.value)} style={champStyle} />
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5, width: '100%' }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onAnnuler} style={{ fontSize: 12.5, padding: '10px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
