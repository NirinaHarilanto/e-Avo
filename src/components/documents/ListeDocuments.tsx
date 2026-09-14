import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { CATEGORIES } from './UploaderDocument'
import { EtatVide } from '../ui/EtatVide'
import { boutonSecondaireStyle, boutonDangerStyle } from '../ui/Boutons'

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
  messageVide?: string
}

const enTeteStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--muted-2)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

export function ListeDocuments({ documents, peutSupprimer, onChange, messageVide }: ListeDocumentsProps) {
  if (documents.length === 0) {
    return (
      <EtatVide
        compact
        icone="documents"
        titre="Aucun document"
        description={messageVide ?? 'Utilisez le formulaire ci-dessus pour déposer un premier fichier (PDF, image ou .docx, 20 Mo maximum).'}
      />
    )
  }

  return (
    <div>
      {/* La liste se lisait comme un tableau sans jamais dire ce que contenaient ses colonnes.
          En-têtes visuels uniquement : chaque ligne reste lisible seule à la lecture d'écran. */}
      <div
        aria-hidden
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 4px 8px', borderBottom: '1px solid var(--border-soft)' }}
      >
        <span style={{ ...enTeteStyle, flexGrow: 1, minWidth: 200 }}>Fichier</span>
        <span style={{ ...enTeteStyle, width: 160, textAlign: 'right' }}>Actions</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {documents.map((document) => (
          <LigneDocument key={document.id} document={document} peutSupprimer={peutSupprimer(document)} onChange={onChange} />
        ))}
      </div>
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
    <div className="row-hl" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 4px', borderBottom: '1px solid var(--border-soft)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1, minWidth: 200 }}>
        <span style={{ fontSize: 13, color: 'var(--ink)' }}>{document.nom_original}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--muted)' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--accent-cyan)',
              background: 'rgba(94,179,255,.10)',
              border: '1px solid rgba(94,179,255,.22)',
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            {libelleCategorie(document.categorie)}
          </span>
          {formatTaille(document.taille_octets)} · déposé le {new Date(document.created_at).toLocaleDateString('fr-FR')}
        </span>
        {erreur && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{erreur}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={telecharger} style={boutonSecondaireStyle}>
          Télécharger
        </button>
        {peutSupprimer && (
          <button onClick={supprimer} disabled={enCours} style={{ ...boutonDangerStyle, opacity: enCours ? 0.6 : 1 }}>
            {enCours ? 'Suppression…' : 'Supprimer'}
          </button>
        )}
      </div>
    </div>
  )
}
