import { useState } from 'react'
import type { Database } from '../../types/database.types'
import { libelleCategorie } from './UploaderDocument'
import { DetailDocumentModale } from './DetailDocumentModale'
import { EtatVide } from '../ui/EtatVide'
import { Icone } from '../ui/Icones'

type Document = Database['public']['Tables']['documents']['Row']

function formatTaille(octets: number) {
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

interface ListeDocumentsProps {
  documents: Document[]
  peutSupprimer: (document: Document) => boolean
  onChange: () => void
  messageVide?: string
  /* Partage de la vue d'un fichier avec une autre personne (0059). Proposé par DÉFAUT sur tout
     fichier affiché : « TOUT utilisateur voyant un document dans son espace peut ajouter une vue
     du document à un autre utilisateur même s'il n'est pas propriétaire » (règle client du
     2026-10-10, policy 0111). Un appelant peut encore le restreindre — mais plus l'ouvrir : la
     base refuserait un partage portant sur un document que l'émetteur ne voit pas. */
  peutPartager?: (document: Document) => boolean
  /* Mention affichée sur un fichier reçu en partage : qui l'a transmis, et son mot éventuel. */
  mentionPartage?: (document: Document) => { par: string; message: string | null } | null
}

const enTeteStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--muted-2)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

/* Chaque ligne ouvre le détail du document en pop-up (demande client du 2026-09-22) : c'est là
   que vivent téléchargement, partage et suppression — plus aucun bouton d'action directement
   sur la ligne, qui reste donc lisible même sur un petit écran. */
export function ListeDocuments({ documents, peutSupprimer, onChange, messageVide, peutPartager, mentionPartage }: ListeDocumentsProps) {
  const [ouvert, setOuvert] = useState<Document | null>(null)

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
      <div
        aria-hidden
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 4px 8px', borderBottom: '1px solid var(--border-soft)' }}
      >
        <span style={{ ...enTeteStyle, flexGrow: 1, minWidth: 200 }}>Fichier</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Une seule ligne par fichier — nom, catégorie, taille et date alignés ensemble (demande
           client du 2026-10-10 : « les autres attributs du fichier devraient être alignés avec le
           nom du fichier sur la même ligne [...] les fichiers devraient s'afficher en mode liste
           toujours »). Composant partagé par les trois espaces (admin, professeur, étudiant), donc
           une seule retouche ici suffit à tous les écrans. `flexWrap` reste le seul filet pour un
           très petit écran ou un nom de fichier long : la ligne se scinde alors, elle ne s'étire
           jamais hors cadre.

           La mention « Partagé avec vous par... » (demande client du 2026-10-10 également) est
           retirée d'ici — elle alourdissait la ligne d'une troisième hauteur de texte — mais pas
           supprimée : elle reste visible dans la fiche du document, ouverte au clic
           (DetailDocumentModale), qui est l'endroit où ce genre de détail se consulte déjà
           (catégorie en toutes lettres, taille, date de dépôt). */}
        {documents.map((document) => (
          <button
            key={document.id}
            type="button"
            onClick={() => setOuvert(document)}
            className="row-hl"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '11px 4px',
              borderBottom: '1px solid var(--border-soft)',
              background: 'transparent',
              border: 'none',
              borderRadius: 0,
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexGrow: 1, minWidth: 200 }}>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>{document.nom_original}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--accent-cyan)',
                  background: 'rgba(169,140,255,.10)',
                  border: '1px solid rgba(169,140,255,.22)',
                  borderRadius: 999,
                  padding: '2px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                {libelleCategorie(document)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {formatTaille(document.taille_octets)} · déposé le {new Date(document.created_at).toLocaleDateString('fr-FR')}
              </span>
            </span>
            <Icone nom="chevron" taille={14} />
          </button>
        ))}
      </div>

      {ouvert && (
        <DetailDocumentModale
          document={ouvert}
          peutSupprimer={peutSupprimer(ouvert)}
          peutPartager={peutPartager?.(ouvert) ?? true}
          mention={mentionPartage?.(ouvert) ?? null}
          onFermer={() => setOuvert(null)}
          onChange={onChange}
        />
      )}
    </div>
  )
}
