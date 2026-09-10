import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { extraireVariables } from '../../lib/contrats'
import type { Role, VariableTemplate } from '../../types/database.types'

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
}

interface CreerContratTemplateProps {
  etablissementId: string
  onCree: () => void
  onAnnuler: () => void
}

export function CreerContratTemplate({ etablissementId, onCree, onAnnuler }: CreerContratTemplateProps) {
  const { profile } = useProfileContext()
  const [nom, setNom] = useState('')
  const [publicCible, setPublicCible] = useState<Role>('etudiant')
  const [corpsTemplate, setCorpsTemplate] = useState('')
  const [variables, setVariables] = useState<VariableTemplate[]>([])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function detecterVariables() {
    const cles = extraireVariables(corpsTemplate)
    setVariables(cles.map((cle) => variables.find((v) => v.cle === cle) ?? { cle, label: cle }))
  }

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!profile || !nom || !corpsTemplate) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('contract_templates').insert({
      etablissement_id: etablissementId,
      nom,
      public_cible: publicCible,
      corps_template: corpsTemplate,
      variables_disponibles: variables,
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
      <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>Nouveau modèle de contrat</h3>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 220 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Nom du modèle</label>
          <input required value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Contrat de cours particuliers" style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 180 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Public cible</label>
          <select value={publicCible} onChange={(e) => setPublicCible(e.target.value as Role)} style={champStyle}>
            <option value="etudiant">Étudiant</option>
            <option value="professeur">Professeur</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>
          Texte du contrat — utiliser <code>{'{{variable}}'}</code> pour les valeurs à personnaliser
        </label>
        <textarea
          required
          rows={10}
          value={corpsTemplate}
          onChange={(e) => setCorpsTemplate(e.target.value)}
          placeholder={'Entre {{nom_etablissement}} et {{nom_etudiant}}, il est convenu ce qui suit…'}
          style={{ ...champStyle, fontFamily: 'monospace', resize: 'vertical' }}
        />
        <button type="button" onClick={detecterVariables} style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}>
          Détecter les variables du texte
        </button>
      </div>

      {variables.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Libellés des variables (affichés à la génération)</label>
          {variables.map((variable, index) => (
            <div key={variable.cle} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ fontSize: 12, color: 'var(--muted)', width: 160, flexShrink: 0 }}>{'{{' + variable.cle + '}}'}</code>
              <input
                value={variable.label}
                onChange={(e) => setVariables(variables.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)))}
                style={{ ...champStyle, flexGrow: 1 }}
              />
            </div>
          ))}
        </div>
      )}

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAnnuler} style={{ fontSize: 12.5, padding: '10px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Enregistrement…' : 'Enregistrer le modèle'}
        </button>
      </div>
    </form>
  )
}
