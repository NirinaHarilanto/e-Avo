import { useMemo, useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { supabase } from '../../lib/supabaseClient'
import { substituerVariables } from '../../lib/contrats'
import type { Database } from '../../types/database.types'

type ContractTemplate = Database['public']['Tables']['contract_templates']['Row']

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
}

interface GenererContratProps {
  etablissementId: string
  modeles: ContractTemplate[]
  onCree: () => void
  onAnnuler: () => void
}

export function GenererContrat({ etablissementId, modeles, onCree, onAnnuler }: GenererContratProps) {
  const { profile } = useProfileContext()
  const { etudiants } = useEtudiants()
  const { professeurs } = useProfesseurs()
  const [templateId, setTemplateId] = useState('')
  const [destinataireId, setDestinataireId] = useState('')
  const [titre, setTitre] = useState('')
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const modele = modeles.find((m) => m.id === templateId) ?? null
  const destinataires = modele?.public_cible === 'professeur' ? professeurs : etudiants

  const corpsGenere = useMemo(() => (modele ? substituerVariables(modele.corps_template, valeurs) : ''), [modele, valeurs])

  function choisirModele(id: string) {
    setTemplateId(id)
    setDestinataireId('')
    setValeurs({})
    const trouve = modeles.find((m) => m.id === id)
    if (trouve) setTitre(trouve.nom)
  }

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!profile || !modele || !destinataireId || !titre) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('contracts').insert({
      etablissement_id: etablissementId,
      template_id: modele.id,
      destinataire_profile_id: destinataireId,
      destinataire_role: modele.public_cible,
      titre,
      corps_genere: corpsGenere,
      variables_valeurs: valeurs,
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
      <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>Générer un contrat</h3>

      {modeles.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Créez d'abord un modèle de contrat actif.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Modèle</label>
              <select required value={templateId} onChange={(e) => choisirModele(e.target.value)} style={champStyle}>
                <option value="">Sélectionner…</option>
                {modeles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom} ({m.public_cible === 'professeur' ? 'professeur' : 'étudiant'})
                  </option>
                ))}
              </select>
            </div>
            {modele && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Destinataire</label>
                <select required value={destinataireId} onChange={(e) => setDestinataireId(e.target.value)} style={champStyle}>
                  <option value="">Sélectionner…</option>
                  {destinataires.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.prenom} {d.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {modele && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 220 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Titre du contrat</label>
                <input required value={titre} onChange={(e) => setTitre(e.target.value)} style={champStyle} />
              </div>
            )}
          </div>

          {modele && modele.variables_disponibles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Variables</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {modele.variables_disponibles.map((variable) => (
                  <div key={variable.cle} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>{variable.label}</label>
                    <input
                      value={valeurs[variable.cle] ?? ''}
                      onChange={(e) => setValeurs({ ...valeurs, [variable.cle]: e.target.value })}
                      style={champStyle}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {modele && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Aperçu</label>
              <div style={{ ...champStyle, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto', lineHeight: 1.6 }}>{corpsGenere}</div>
            </div>
          )}
        </>
      )}

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAnnuler} style={{ fontSize: 12.5, padding: '10px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours || !modele} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours || !modele ? 0.6 : 1 }}>
          {enCours ? 'Génération…' : 'Générer le contrat'}
        </button>
      </div>
    </form>
  )
}
