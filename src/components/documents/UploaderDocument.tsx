import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { CategorieDocument, Database } from '../../types/database.types'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'

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
  { value: 'confidentiel', label: 'Confidentiel' },
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
  // Onglet "Partageables" (DocumentsAdmin) : catégorie fixée, pas de sélecteur affiché.
  forcerCategorie?: CategorieDocument
  // Onglet "Partageables" : le document est visible par tout l'établissement plutôt que par
  // les seules personnes couvertes par les policies habituelles (propriétaire/uploadeur/admin).
  etablissementWide?: boolean
  // Dossier de destination dans l'arborescence (0058). `null`/absent = racine. Le classement ne
  // change aucun droit d'accès : le fichier reste visible exactement par les mêmes personnes.
  dossierId?: string | null
}

/* Upload en deux temps (pattern décrit dans le plan de la Phase 2) : (1) insert dans
   `documents` — le trigger documents_before_insert (migration 0018) calcule storage_path et
   owner_role côté serveur, jamais fournis par ce composant — puis (2) upload du fichier à ce
   chemin dans le bucket Storage `documents`. Si l'étape 2 échoue, la ligne insérée en (1) est
   retirée pour ne jamais laisser un document "fantôme" sans fichier. */
export function UploaderDocument({ ownerProfileId, etablissementId, onUploade, forcerCategorie, etablissementWide, dossierId }: UploaderDocumentProps) {
  const { session } = useProfileContext()
  const [fichier, setFichier] = useState<File | null>(null)
  const [categorie, setCategorie] = useState<CategorieDocument>(forcerCategorie ?? 'autre')
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
        categorie: forcerCategorie ?? categorie,
        nom_original: fichier.name,
        mime_type: fichier.type,
        taille_octets: fichier.size,
        etablissement_wide: !!etablissementWide,
        dossier_id: dossierId ?? null,
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
    <form onSubmit={envoyer} className="card" style={{ padding: 18, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {!forcerCategorie && (
        <Champ label="Catégorie" aide="Détermine qui pourra voir ce fichier." style={{ minWidth: 200 }}>
          <select value={categorie} onChange={(e) => setCategorie(e.target.value as CategorieDocument)} style={champStyle}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Champ>
      )}
      <Champ label="Fichier" aide="PDF, image ou .docx — 20 Mo maximum." obligatoire style={{ flexGrow: 1, minWidth: 220 }}>
        <input
          type="file"
          accept={TYPES_ACCEPTES.join(',')}
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          style={{ fontSize: 12.5, color: 'var(--ink)', padding: '8px 0' }}
        />
      </Champ>
      {erreur && (
        <div style={{ width: '100%' }}>
          <MessageErreur>{erreur}</MessageErreur>
        </div>
      )}
      <button
        type="submit"
        disabled={!fichier || enCours}
        className="btn-shine"
        style={{ ...boutonPrimaireStyle, marginTop: 18, opacity: !fichier || enCours ? 0.6 : 1 }}
      >
        {enCours ? 'Envoi…' : 'Ajouter le document'}
      </button>
    </form>
  )
}
