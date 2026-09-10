import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { CATEGORIES } from './UploaderDocument'

type Document = Database['public']['Tables']['documents']['Row']

function formatTaille(octets: number) {
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

function libelleCategorie(categorie: Document['categorie']) {
  return CATEGORIES.find((c) => c.value === categorie)?.label ?? categorie
}

interface ListeDocumentsProps {
  documents: Document[]
  peutSupprimer: (document: Document) => boolean
  onChange: () => void
}

export function ListeDocuments({ documents, peutSupprimer, onChange }: ListeDocumentsProps) {
  if (documents.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucun document.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {documents.map((document) => (
        <LigneDocument key={document.id} document={document} peutSupprimer={peutSupprimer(document)} onChange={onChange} />
      ))}
    </div>
  )
}

function LigneDocument({ document, peutSupprimer, onChange }: { document: Document; peutSupprimer: boolean; onChange: () => void }) {
  const { session } = useProfileContext()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function telecharger() {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(document.storage_path, 60)
    if (error || !data) {
      setErreur(error?.message ?? 'Téléchargement impossible.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noreferrer')
  }

  async function supprimer() {
    if (!session) return
    if (!window.confirm(`Supprimer « ${document.nom_original} » ?`)) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/documents/supprimer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ documentId: document.id }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La suppression a échoué.')
      return
    }
    onChange()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 4px', borderBottom: '1px solid var(--border-soft)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 200 }}>
        <span style={{ fontSize: 13, color: 'var(--ink)' }}>{document.nom_original}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {libelleCategorie(document.categorie)} · {formatTaille(document.taille_octets)} · {new Date(document.created_at).toLocaleDateString('fr-FR')}
        </span>
        {erreur && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{erreur}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={telecharger}
          style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
        >
          Télécharger
        </button>
        {peutSupprimer && (
          <button
            onClick={supprimer}
            disabled={enCours}
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer', opacity: enCours ? 0.6 : 1 }}
          >
            Supprimer
          </button>
        )}
      </div>
    </div>
  )
}
