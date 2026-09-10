import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlateformeLayout } from '../layout/PlateformeLayout'
import { useEtablissementsPlateforme } from '../../hooks/useEtablissementsPlateforme'
import { supabase } from '../../lib/supabaseClient'

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
}

export function EtablissementsPlateforme() {
  const navigate = useNavigate()
  const { etablissements, loading, recharger } = useEtablissementsPlateforme()
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  return (
    <PlateformeLayout actif="Établissements">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <h1 style={{ fontSize: 28, color: '#fff' }}>Établissements</h1>
        <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
          Nouvel établissement
        </button>
      </div>

      {formulaireOuvert && (
        <FormulaireCreationEtablissement
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : etablissements.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Aucun établissement pour le moment.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {etablissements.map((etablissement) => (
            <button
              key={etablissement.id}
              onClick={() => navigate(`/plateforme/etablissements/${etablissement.id}`)}
              className="card card-lift"
              style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', cursor: 'pointer', color: 'inherit' }}
            >
              <span
                className="brand-font"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: etablissement.couleur_accent ?? 'var(--accent-gradient)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1b1510',
                  fontSize: 14,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {etablissement.nom.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
                  {etablissement.nom}
                </span>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  /e/{etablissement.slug}
                  {etablissement.specialite && ` · ${etablissement.specialite}`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </PlateformeLayout>
  )
}

function FormulaireCreationEtablissement({ onAnnuler, onCree }: { onAnnuler: () => void; onCree: () => void }) {
  const [nom, setNom] = useState('')
  const [slug, setSlug] = useState('')
  const [specialite, setSpecialite] = useState('')
  const [couleurAccent, setCouleurAccent] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!nom || !slug) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('etablissements').insert({
      nom,
      slug,
      specialite: specialite || null,
      couleur_accent: couleurAccent || null,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 180 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Nom</label>
        <input required value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Slug (URL /e/…)</label>
        <input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mon-etablissement" style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Spécialité (optionnel)</label>
        <input value={specialite} onChange={(e) => setSpecialite(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 120 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Couleur (optionnel)</label>
        <input value={couleurAccent} onChange={(e) => setCouleurAccent(e.target.value)} placeholder="#e9cf94" style={champStyle} />
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5, width: '100%' }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onAnnuler} style={{ fontSize: 12.5, padding: '10px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Création…' : 'Créer'}
        </button>
      </div>
    </form>
  )
}
