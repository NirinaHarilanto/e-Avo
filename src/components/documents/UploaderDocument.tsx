import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { CategorieDocument, Database } from '../../types/database.types'

type Document = Database['public']['Tables']['documents']['Row']

const TAILLE_MAX_OCTETS = 20 * 1024 * 1024
const TYPES_ACCEPTES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export const CATEGORIES: { value: CategorieDocument; label: string }[] = [
  { value: 'identite', label: "Pièce d'identité" },
  { value: 'diplome_certification', label: 'Diplôme / certification' },
  { value: 'justificatif_domicile', label: 'Justificatif de domicile' },
  { value: 'devis', label: 'Devis' },
  { value: 'facture', label: 'Facture' },
  { value: 'contrat', label: 'Contrat' },
  { value: 'support_pedagogique', label: 'Support pédagogique' },
  { value: 'autre', label: 'Autre' },
]

interface UploaderDocumentProps {
  ownerProfileId: string
  etablissementId: string
  // Reçoit la ligne `documents` créée — utile quand l'appelant doit ensuite rattacher ce
  // document à une autre ressource (ex. ContratsAdmin.tsx : contracts.document_id). Les
  // appelants qui n'ont besoin que d'un signal de rafraîchissement (ex. recharger()) restent
  // valides tels quels, une fonction sans paramètre acceptant cet appel sans erreur.
  onUploade: (document: Document) => void
}

/* Upload en deux temps (pattern décrit dans le plan de la Phase 2) : (1) insert dans
   `documents` — le trigger documents_before_insert (migration 0018) calcule storage_path et
   owner_role côté serveur, jamais fournis par ce composant — puis (2) upload du fichier à ce
   chemin dans le bucket Storage `documents`. Si l'étape 2 échoue, la ligne insérée en (1) est
   retirée pour ne jamais laisser un document "fantôme" sans fichier. */
export function UploaderDocument({ ownerProfileId, etablissementId, onUploade }: UploaderDocumentProps) {
  const { session } = useProfileContext()
  const [fichier, setFichier] = useState<File | null>(null)
  const [categorie, setCategorie] = useState<CategorieDocument>('autre')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!fichier || !session) return

    if (fichier.size > TAILLE_MAX_OCTETS) {
      setErreur('Le fichier dépasse la taille maximale autorisée (20 Mo).')
      return
    }
    if (!TYPES_ACCEPTES.includes(fichier.type)) {
      setErreur('Type de fichier non accepté (PDF, image ou .docx uniquement).')
      return
    }

    setEnCours(true)
    setErreur(null)

    const { data: ligne, error: insertError } = await supabase
      .from('documents')
      .insert({
        etablissement_id: etablissementId,
        owner_profile_id: ownerProfileId,
        uploaded_by_profile_id: session.user.id,
        categorie,
        nom_original: fichier.name,
        mime_type: fichier.type,
        taille_octets: fichier.size,
      })
      .select()
      .single()

    if (insertError || !ligne) {
      setEnCours(false)
      setErreur(insertError?.message ?? "L'enregistrement du document a échoué.")
      return
    }

    const { error: uploadError } = await supabase.storage.from('documents').upload(ligne.storage_path, fichier)
    setEnCours(false)
    if (uploadError) {
      await supabase.from('documents').delete().eq('id', ligne.id)
      setErreur(uploadError.message)
      return
    }

    setFichier(null)
    onUploade(ligne)
  }

  return (
    <form onSubmit={envoyer} className="card" style={{ padding: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Catégorie</label>
        <select
          value={categorie}
          onChange={(e) => setCategorie(e.target.value as CategorieDocument)}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 220 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Fichier (PDF, image ou .docx, 20 Mo max)</label>
        <input
          type="file"
          accept={TYPES_ACCEPTES.join(',')}
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          style={{ fontSize: 12.5, color: 'var(--ink)' }}
        />
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5, width: '100%' }}>{erreur}</p>}
      <button type="submit" disabled={!fichier || enCours} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: !fichier || enCours ? 0.6 : 1 }}>
        {enCours ? 'Envoi…' : 'Ajouter le document'}
      </button>
    </form>
  )
}
