import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { useCategoriesDocumentsPersonnalisees } from '../../hooks/useCategoriesDocumentsPersonnalisees'
import type { CategorieDocument, Database } from '../../types/database.types'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle, boutonSecondaireStyle, boutonNeutreStyle } from '../ui/Boutons'

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

/* Préfixe distinguant, dans le `<select>`, une catégorie personnalisée (encodée
   `custom:<libellé>`) d'une des neuf valeurs fixes de l'énumération — et valeur sentinelle de
   l'action « + Ajouter une catégorie… », qui n'est elle-même jamais une catégorie. */
const PREFIXE_CUSTOM = 'custom:'
const VALEUR_NOUVELLE_CATEGORIE = '__nouvelle__'
const LONGUEUR_MAX_CATEGORIE = 60

/* Libellé affiché pour un document, catégorie personnalisée comprise (0109) — remplace les deux
   copies locales identiques de ListeDocuments.tsx et DetailDocumentModale.tsx. */
export function libelleCategorie(document: Pick<Document, 'categorie' | 'categorie_libre'>): string {
  if (document.categorie === 'autre' && document.categorie_libre) return document.categorie_libre
  return CATEGORIES.find((c) => c.value === document.categorie)?.label ?? document.categorie
}

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
  // Libellé de la catégorie personnalisée choisie (0109) — toujours `null` tant que `categorie`
  // n'est pas 'autre' : les deux ne sont jamais incohérents, voir la contrainte en base.
  const [categorieLibre, setCategorieLibre] = useState<string | null>(null)
  const [ajoutCategorieOuvert, setAjoutCategorieOuvert] = useState(false)
  const [nouvelleCategorie, setNouvelleCategorie] = useState('')
  // Ajoutées à la volée dans CETTE session, avant même que le document ne soit envoyé et que la
  // liste lue en base (ci-dessous) n'ait eu l'occasion de les revoir — sans quoi la catégorie
  // qu'on vient de taper disparaîtrait du menu le temps d'un aller-retour réseau.
  const [categoriesLocales, setCategoriesLocales] = useState<string[]>([])
  const { categoriesPersonnalisees, recharger: rechargerCategories } = useCategoriesDocumentsPersonnalisees(etablissementId)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const toutesCategoriesPersonnalisees = [...new Set([...categoriesPersonnalisees, ...categoriesLocales])].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  )
  const valeurSelect = categorieLibre ? `${PREFIXE_CUSTOM}${categorieLibre}` : categorie

  function surChangementCategorie(valeur: string) {
    if (valeur === VALEUR_NOUVELLE_CATEGORIE) {
      setAjoutCategorieOuvert(true)
      return
    }
    if (valeur.startsWith(PREFIXE_CUSTOM)) {
      setCategorie('autre')
      setCategorieLibre(valeur.slice(PREFIXE_CUSTOM.length))
      return
    }
    setCategorie(valeur as CategorieDocument)
    setCategorieLibre(null)
  }

  function confirmerNouvelleCategorie() {
    const libelle = nouvelleCategorie.trim().slice(0, LONGUEUR_MAX_CATEGORIE)
    if (!libelle) return
    // Comparaison exacte (insensible à la casse) avec les catégories déjà proposées — fixes ou
    // personnalisées — pour éviter deux entrées quasi identiques dans le menu ; un rapprochement
    // plus fin (fautes de frappe, singulier/pluriel) serait disproportionné pour une poignée
    // d'étiquettes par établissement.
    const dejaProposee = [...CATEGORIES.map((c) => c.label), ...toutesCategoriesPersonnalisees].some(
      (l) => l.toLowerCase() === libelle.toLowerCase(),
    )
    if (!dejaProposee) setCategoriesLocales((actuelles) => [...actuelles, libelle])
    setCategorie('autre')
    setCategorieLibre(libelle)
    setNouvelleCategorie('')
    setAjoutCategorieOuvert(false)
  }

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
        categorie_libre: forcerCategorie ? null : categorieLibre,
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
    // Une catégorie tapée à l'instant doit réapparaître pour le PROCHAIN document sans attendre
    // l'aller-retour réseau — déjà assuré par `categoriesLocales` — mais aussi se retrouver dans
    // la liste partagée par les autres écrans/onglets, d'où ce rechargement.
    if (categorieLibre) rechargerCategories()
    onUploade(ligne)
  }

  return (
    <form onSubmit={envoyer} className="card" style={{ padding: 18, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {!forcerCategorie && (
        <Champ label="Catégorie" aide="Détermine qui pourra voir ce fichier." style={{ minWidth: 200 }}>
          <select value={valeurSelect} onChange={(e) => surChangementCategorie(e.target.value)} style={champStyle}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
            {toutesCategoriesPersonnalisees.length > 0 && (
              <optgroup label="Catégories personnalisées">
                {toutesCategoriesPersonnalisees.map((libelle) => (
                  <option key={libelle} value={`${PREFIXE_CUSTOM}${libelle}`}>
                    {libelle}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={VALEUR_NOUVELLE_CATEGORIE}>+ Ajouter une catégorie…</option>
          </select>
          {ajoutCategorieOuvert && (
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <input
                autoFocus
                value={nouvelleCategorie}
                onChange={(e) => setNouvelleCategorie(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirmerNouvelleCategorie()
                  }
                }}
                placeholder="Nom de la catégorie…"
                maxLength={LONGUEUR_MAX_CATEGORIE}
                style={{ ...champStyle, flexGrow: 1 }}
              />
              <button type="button" onClick={confirmerNouvelleCategorie} style={{ ...boutonSecondaireStyle, padding: '7px 11px' }}>
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => {
                  setAjoutCategorieOuvert(false)
                  setNouvelleCategorie('')
                }}
                style={{ ...boutonNeutreStyle, padding: '7px 11px' }}
              >
                Annuler
              </button>
            </div>
          )}
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
