import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useEtudiants } from '../../hooks/useEtudiants'
import { supabase } from '../../lib/supabaseClient'
import type { LigneFacturation } from '../../types/database.types'
import { EditeurLignes, calculerTotaux } from './EditeurLignes'

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
}

interface CreerDevisProps {
  etablissementId: string
  onCree: () => void
  onAnnuler: () => void
}

export function CreerDevis({ etablissementId, onCree, onAnnuler }: CreerDevisProps) {
  const { profile } = useProfileContext()
  const { etudiants } = useEtudiants()
  const [studentId, setStudentId] = useState('')
  const [numero, setNumero] = useState('')
  const [objet, setObjet] = useState('')
  const [dateValidite, setDateValidite] = useState('')
  const [lignes, setLignes] = useState<LigneFacturation[]>([{ description: '', quantite: 1, prix_unitaire_ht: 0, tva_pct: 20 }])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!profile || !studentId || !numero) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('quotes').insert({
      etablissement_id: etablissementId,
      student_id: studentId,
      numero,
      objet: objet || null,
      lignes,
      ...calculerTotaux(lignes),
      date_validite: dateValidite || null,
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
    <form onSubmit={creer} className="card" style={{ padding: 18, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>Nouveau devis</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Étudiant</label>
          <select required value={studentId} onChange={(e) => setStudentId(e.target.value)} style={champStyle}>
            <option value="">Sélectionner…</option>
            {etudiants.map((e) => (
              <option key={e.id} value={e.id}>
                {e.prenom} {e.nom}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 160 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Numéro</label>
          <input required value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="DEV-2026-001" style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Objet</label>
          <input value={objet} onChange={(e) => setObjet(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 160 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Validité jusqu'au</label>
          <input type="date" value={dateValidite} onChange={(e) => setDateValidite(e.target.value)} style={champStyle} />
        </div>
      </div>

      <EditeurLignes lignes={lignes} onChange={setLignes} />

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAnnuler} style={{ fontSize: 12.5, padding: '10px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Enregistrement…' : 'Enregistrer le devis'}
        </button>
      </div>
    </form>
  )
}
