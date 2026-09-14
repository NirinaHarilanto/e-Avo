import { useEffect, useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useEtudiants } from '../../hooks/useEtudiants'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { champStyle } from '../ui/Champ'

type Package = Database['public']['Tables']['packages']['Row']

const LABEL_PROGRAMME: Record<Package['type_programme'], string> = { individuel: 'Individuel', duo: 'Duo', collectif: 'Collectif' }

interface CreerPaiementEtudiantProps {
  etablissementId: string
  onCree: () => void
  onAnnuler: () => void
}

export function CreerPaiementEtudiant({ etablissementId, onCree, onAnnuler }: CreerPaiementEtudiantProps) {
  const { profile } = useProfileContext()
  const { etudiants } = useEtudiants()
  const [studentId, setStudentId] = useState('')
  const [forfaits, setForfaits] = useState<Package[]>([])
  const [packageId, setPackageId] = useState('')
  const [montant, setMontant] = useState('')
  const [dateEcheance, setDateEcheance] = useState('')
  const [moyenPaiement, setMoyenPaiement] = useState('')
  const [reference, setReference] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    setPackageId('')
    if (!studentId) {
      setForfaits([])
      return
    }
    supabase
      .from('packages')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setForfaits(data ?? []))
  }, [studentId])

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!profile || !studentId || !montant) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('student_payments').insert({
      etablissement_id: etablissementId,
      student_id: studentId,
      package_id: packageId || null,
      montant: Number(montant),
      date_echeance: dateEcheance || null,
      moyen_paiement: moyenPaiement || null,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Forfait / programme (optionnel)</label>
        <select value={packageId} onChange={(e) => setPackageId(e.target.value)} disabled={forfaits.length === 0} style={champStyle}>
          <option value="">Aucun forfait rattaché</option>
          {forfaits.map((f) => (
            <option key={f.id} value={f.id}>
              {LABEL_PROGRAMME[f.type_programme]} · {f.total_heures} h
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 130 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Montant (€)</label>
        <input required type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Échéance</label>
        <input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Moyen de paiement</label>
        <input value={moyenPaiement} onChange={(e) => setMoyenPaiement(e.target.value)} placeholder="Virement, carte…" style={champStyle} />
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
