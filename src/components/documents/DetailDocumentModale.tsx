import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { CATEGORIES } from './UploaderDocument'
import { PartagerDocumentModale } from './PartagerDocumentModale'
import { Modale } from '../ui/Modale'
import { LigneInfo } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonSecondaireStyle, boutonDangerStyle, boutonPrimaireStyle } from '../ui/Boutons'

type Document = Database['public']['Tables']['documents']['Row']

function formatTaille(octets: number) {
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

function libelleCategorie(categorie: Document['categorie']) {
  return CATEGORIES.find((c) => c.value === categorie)?.label ?? categorie
}

/* Pop-up ouvert au clic d'un document (demande client du 2026-09-22) : ses informations et ses
   trois actions (télécharger, partager, supprimer) vivent toutes ici plutôt que dans des boutons
   éparpillés sur la ligne de liste — un seul endroit où retrouver ce qu'on peut faire d'un
   fichier, cohérent avec le reste de l'application (fenêtres de détail des paiements, des
   rendez-vous...). Le partage lui-même reste porté par PartagerDocumentModale, ouvert par-dessus
   celui-ci (même précédent que les pop-up imbriquées déjà en place ailleurs). */
export function DetailDocumentModale({
  document,
  peutSupprimer,
  peutPartager,
  mention,
  onFermer,
  onChange,
}: {
  document: Document
  peutSupprimer: boolean
  peutPartager: boolean
  mention: { par: string; message: string | null } | null
  onFermer: () => void
  onChange: () => void
}) {
  const { session } = useProfileContext()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [partageOuvert, setPartageOuvert] = useState(false)

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
    onFermer()
  }

  return (
    <Modale titre={document.nom_original} onFermer={onFermer} largeurMax={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <LigneInfo label="Catégorie" valeur={libelleCategorie(document.categorie)} />
        <LigneInfo label="Taille" valeur={formatTaille(document.taille_octets)} />
        <LigneInfo label="Déposé le" valeur={new Date(document.created_at).toLocaleDateString('fr-FR')} />

        {mention && (
          <div style={{ padding: '9px 11px', borderRadius: 10, background: 'rgba(111,227,192,.08)', border: '1px solid rgba(111,227,192,.28)' }}>
            <span style={{ fontSize: 12, color: 'var(--accent-teal)' }}>Partagé avec vous par {mention.par}</span>
            {mention.message && (
              <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', margin: '4px 0 0' }}>« {mention.message} »</p>
            )}
          </div>
        )}

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={telecharger} className="btn-shine" style={{ ...boutonPrimaireStyle, flexGrow: 1 }}>
            Télécharger
          </button>
          {peutPartager && (
            <button onClick={() => setPartageOuvert(true)} style={{ ...boutonSecondaireStyle, flexGrow: 1 }}>
              Partager
            </button>
          )}
          {peutSupprimer && (
            <button onClick={supprimer} disabled={enCours} style={{ ...boutonDangerStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}>
              {enCours ? 'Suppression…' : 'Supprimer'}
            </button>
          )}
        </div>
      </div>

      {partageOuvert && (
        <PartagerDocumentModale document={document} onFermer={() => setPartageOuvert(false)} onChange={onChange} />
      )}
    </Modale>
  )
}
