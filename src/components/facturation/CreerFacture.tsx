import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { supabase } from '../../lib/supabaseClient'
import type { DevisAvecEtudiant } from '../../hooks/useDevis'
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

interface CreerFactureProps {
  etablissementId: string
  devisAcceptes: DevisAvecEtudiant[]
  onCree: () => void
  onAnnuler: () => void
}

type TypeDestinataire = 'etudiant' | 'professeur'

/* Une facture peut être créée à partir d'un devis accepté (étudiant uniquement — pré-remplit
   étudiant/objet/lignes, garde le lien via quote_id) ou directement à zéro pour un étudiant ou
   un professeur (rémunération). */
export function CreerFacture({ etablissementId, devisAcceptes, onCree, onAnnuler }: CreerFactureProps) {
  const { profile } = useProfileContext()
  const { etudiants } = useEtudiants()
  const { professeurs } = useProfesseurs()
  const [typeDestinataire, setTypeDestinataire] = useState<TypeDestinataire>('etudiant')
  const [quoteId, setQuoteId] = useState('')
  const [destinataireId, setDestinataireId] = useState('')
  const [numero, setNumero] = useState('')
  const [objet, setObjet] = useState('')
  const [dateEcheance, setDateEcheance] = useState('')
  const [lignes, setLignes] = useState<LigneFacturation[]>([{ description: '', quantite: 1, prix_unitaire_ht: 0, tva_pct: 20 }])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function choisirDevis(id: string) {
    setQuoteId(id)
    const trouve = devisAcceptes.find((d) => d.devis.id === id)
    if (trouve) {
      setDestinataireId(trouve.devis.student_id)
      setObjet(trouve.devis.objet ?? '')
      setLignes(trouve.devis.lignes)
    }
  }

  function changerType(type: TypeDestinataire) {
    setTypeDestinataire(type)
    setDestinataireId('')
    setQuoteId('')
  }

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!profile || !destinataireId || !numero) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('invoices').insert({
      etablissement_id: etablissementId,
      student_id: typeDestinataire === 'etudiant' ? destinataireId : null,
      teacher_id: typeDestinataire === 'professeur' ? destinataireId : null,
      quote_id: quoteId || null,
      numero,
      objet: objet || null,
      lignes,
      ...calculerTotaux(lignes),
      date_echeance: dateEcheance || null,
      created_by_profile_id: profile.id,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onCree()
  }

  const personnes = typeDestinataire === 'etudiant' ? etudiants : professeurs

  return (
    <form onSubmit={creer} className="card" style={{ padding: 18, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>Nouvelle facture</h3>

      <div style={{ display: 'flex', gap: 8 }}>
        {(['etudiant', 'professeur'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => changerType(type)}
            style={{
              fontSize: 12.5,
              fontWeight: typeDestinataire === type ? 800 : 600,
              color: typeDestinataire === type ? '#1b1510' : 'var(--ink-2)',
              background: typeDestinataire === type ? 'var(--accent-gradient)' : 'rgba(0,0,0,.22)',
              border: typeDestinataire === type ? 'none' : '1px solid var(--border)',
              borderRadius: 999,
              padding: '8px 14px',
              cursor: 'pointer',
            }}
          >
            {type === 'etudiant' ? 'Étudiant' : 'Professeur'}
          </button>
        ))}
      </div>

      {typeDestinataire === 'etudiant' && devisAcceptes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Depuis un devis accepté (optionnel)</label>
          <select value={quoteId} onChange={(e) => choisirDevis(e.target.value)} style={champStyle}>
            <option value="">Aucun — facture à zéro</option>
            {devisAcceptes.map(({ devis, etudiant }) => (
              <option key={devis.id} value={devis.id}>
                {devis.numero} — {etudiant?.prenom} {etudiant?.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>{typeDestinataire === 'etudiant' ? 'Étudiant' : 'Professeur'}</label>
          <select required value={destinataireId} onChange={(e) => setDestinataireId(e.target.value)} disabled={!!quoteId} style={champStyle}>
            <option value="">Sélectionner…</option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 160 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Numéro</label>
          <input required value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="FAC-2026-001" style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Objet</label>
          <input value={objet} onChange={(e) => setObjet(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 160 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Échéance</label>
          <input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} style={champStyle} />
        </div>
      </div>

      <EditeurLignes lignes={lignes} onChange={setLignes} />

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAnnuler} style={{ fontSize: 12.5, padding: '10px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Enregistrement…' : 'Enregistrer la facture'}
        </button>
      </div>
    </form>
  )
}
