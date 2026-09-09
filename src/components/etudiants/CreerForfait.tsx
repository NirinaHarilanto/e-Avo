import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

interface CreerForfaitProps {
  studentId: string
  etablissementId: string
  onCree: () => void
}

export function CreerForfait({ studentId, etablissementId, onCree }: CreerForfaitProps) {
  const [ouvert, setOuvert] = useState(false)
  const [totalHeures, setTotalHeures] = useState(20)
  const [echeance, setEcheance] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function creer() {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('packages').insert({
      etablissement_id: etablissementId,
      student_id: studentId,
      total_heures: totalHeures,
      echeance: echeance || null,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setOuvert(false)
    onCree()
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="btn-shine" style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-gradient)', color: '#1b1510' }}>
        Créer un forfait
      </button>
    )
  }

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontSize: 14, color: 'var(--accent-gold, #e9cf94)' }}>Nouveau forfait</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Total d'heures</label>
        <input
          type="number"
          min={1}
          value={totalHeures}
          onChange={(e) => setTotalHeures(Number(e.target.value))}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Échéance (optionnel)</label>
        <input
          type="date"
          value={echeance}
          onChange={(e) => setEcheance(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        />
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOuvert(false)} style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button onClick={creer} disabled={enCours} className="btn-shine" style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
          Confirmer
        </button>
      </div>
    </div>
  )
}
