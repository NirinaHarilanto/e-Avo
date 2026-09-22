import { useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { cheminDossier, sousDossiers, useDossiersDocuments, type DossierDocument } from '../../hooks/useDossiersDocuments'
import { useDocumentsPartages } from '../../hooks/useDocumentsPartages'
import type { Database, CategorieDocument } from '../../types/database.types'
import { UploaderDocument } from './UploaderDocument'
import { ListeDocuments } from './ListeDocuments'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonSecondaireStyle, boutonNeutreStyle } from '../ui/Boutons'
import { champStyle } from '../ui/Champ'
import { Icone } from '../ui/Icones'

type Document = Database['public']['Tables']['documents']['Row']

/* Sentinelle du dossier virtuel « Mes fichiers partagés » — jamais un uuid réel, donc aucune
   collision possible avec un identifiant de dossier. */
const ID_PARTAGES = '__partages__'

/* Ordre et libellés des quatre catégories par défaut (0059/0062) — demande client du
   2026-09-22 : « disposées sous forme d'onglets ... intitulés plus visibles et lisibles en
   entier ». Un dossier renommé ou supprimé par la personne sort simplement de cette liste
   (filtré plus bas) plutôt que d'afficher un onglet cassé. */
const NOMS_PAR_DEFAUT = ['Mes supports pédagogiques', 'Mes notes', 'Mes fichiers partagés', 'Mes communications HOC']

/* Espace documentaire arborescent, partagé par les trois espaces (admin, professeur, étudiant)
   — demande client du 2026-09-21. Un seul composant pour les trois : les règles de visibilité
   sont portées par la RLS (0018 pour les fichiers, 0058 pour les dossiers), pas par l'écran,
   donc rien ne justifierait trois copies qui divergeraient.

   Un dossier ne fait que classer : il ne donne ni ne retire aucun droit (voir le commentaire de
   la migration 0058). C'est pourquoi la suppression d'un fichier reste exactement celle d'avant,
   et qu'un dossier ne se supprime que vide — retirer ses fichiers passe obligatoirement par
   l'API qui nettoie aussi le bucket Storage. */
export function ExplorateurDocuments({
  documents,
  ownerProfileId,
  etablissementId,
  peutSupprimer,
  onChange,
  peutOrganiser = true,
  forcerCategorie,
  etablissementWide,
  messageVide,
}: {
  documents: Document[]
  ownerProfileId: string
  etablissementId: string
  peutSupprimer: (document: Document) => boolean
  onChange: () => void
  /* À `false` pour un espace consulté sans pouvoir le réorganiser (un professeur range ses
     propres documents, pas l'arborescence de son élève — voir la policy update de 0058). */
  peutOrganiser?: boolean
  forcerCategorie?: CategorieDocument
  etablissementWide?: boolean
  messageVide?: string
}) {
  const { profile } = useProfileContext()
  const { dossiers, loading, erreur, recharger } = useDossiersDocuments(ownerProfileId)
  const { partages, recharger: rechargerPartages } = useDocumentsPartages(ownerProfileId)
  /* `ID_PARTAGES` désigne le dossier « Mes fichiers partagés », qui n'existe pas en base : les
     fichiers reçus appartiennent à d'autres personnes et restent dans LEUR arborescence (voir
     0059). Une valeur sentinelle plutôt qu'un vrai uuid, donc jamais en collision. */
  const [dossierCourantId, setDossierCourantId] = useState<string | null>(null)
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [nouveauNom, setNouveauNom] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreurAction, setErreurAction] = useState<string | null>(null)

  const dansPartages = dossierCourantId === ID_PARTAGES
  const chemin = useMemo(
    () => (dansPartages ? [] : cheminDossier(dossiers, dossierCourantId)),
    [dossiers, dossierCourantId, dansPartages],
  )
  const enfants = useMemo(
    () => (dansPartages ? [] : sousDossiers(dossiers, dossierCourantId)),
    [dossiers, dossierCourantId, dansPartages],
  )
  const documentsDuDossier = useMemo(
    () =>
      dansPartages
        ? partages.map((p) => p.document)
        : documents.filter((d) => (d.dossier_id ?? null) === dossierCourantId),
    [documents, dossierCourantId, dansPartages, partages],
  )
  const partageParDocument = useMemo(
    () => new Map(partages.map((p) => [p.document.id, p.partage])),
    [partages],
  )

  const racine = useMemo(() => sousDossiers(dossiers, null), [dossiers])
  /* Les quatre onglets, dans l'ordre imposé par le client. `Mes fichiers partagés` est virtuel
     (ID_PARTAGES) ; les trois autres n'apparaissent que si le dossier par défaut correspondant
     existe encore (voir NOMS_PAR_DEFAUT ci-dessus). */
  const onglets = useMemo(() => {
    const parNom = new Map(racine.map((d) => [d.nom, d]))
    return NOMS_PAR_DEFAUT.map((nom) =>
      nom === 'Mes fichiers partagés'
        ? { id: ID_PARTAGES, nom, compteur: partages.length }
        : parNom.has(nom)
          ? { id: parNom.get(nom)!.id, nom, compteur: contenuDe(parNom.get(nom)!).fichiers + contenuDe(parNom.get(nom)!).dossiers }
          : null,
    ).filter((o): o is { id: string; nom: string; compteur: number } => o !== null)
  }, [racine, partages.length, documents, dossiers])
  const idsOnglets = new Set(onglets.map((o) => o.id))
  /* Dossiers créés par la personne à la racine, en plus des quatre par défaut — restent
     accessibles via la grille de cartes classique sous les onglets, pas dupliqués dedans. */
  const racinePersonnalisee = racine.filter((d) => !idsOnglets.has(d.id))

  /* Compteurs affichés sur chaque sous-dossier : ce qu'il contient directement. Volontairement
     pas de total récursif — un chiffre qui inclurait les petits-enfants laisserait croire qu'un
     dossier est plein alors qu'on n'y trouve rien en l'ouvrant. */
  function contenuDe(dossier: DossierDocument) {
    return {
      dossiers: dossiers.filter((d) => d.parent_id === dossier.id).length,
      fichiers: documents.filter((d) => d.dossier_id === dossier.id).length,
    }
  }

  async function creerDossier() {
    if (!profile || !nouveauNom.trim()) return
    setEnCours(true)
    setErreurAction(null)
    const { error } = await supabase.from('document_dossiers').insert({
      etablissement_id: etablissementId,
      proprietaire_profile_id: ownerProfileId,
      parent_id: dossierCourantId,
      nom: nouveauNom.trim(),
      created_by_profile_id: profile.id,
    })
    setEnCours(false)
    if (error) {
      setErreurAction(
        error.code === '23505' ? 'Un dossier porte déjà ce nom à cet endroit.' : error.message,
      )
      return
    }
    setNouveauNom('')
    setCreationOuverte(false)
    recharger()
  }

  async function renommer(dossier: DossierDocument) {
    const nom = window.prompt('Nouveau nom du dossier', dossier.nom)
    if (!nom || !nom.trim() || nom.trim() === dossier.nom) return
    setErreurAction(null)
    const { error } = await supabase.from('document_dossiers').update({ nom: nom.trim() }).eq('id', dossier.id)
    if (error) {
      setErreurAction(error.code === '23505' ? 'Un dossier porte déjà ce nom à cet endroit.' : error.message)
      return
    }
    recharger()
  }

  async function supprimerDossier(dossier: DossierDocument) {
    const contenu = contenuDe(dossier)
    if (contenu.dossiers > 0 || contenu.fichiers > 0) {
      setErreurAction(
        `« ${dossier.nom} » n’est pas vide : videz-le d’abord (${contenu.fichiers} fichier(s), ${contenu.dossiers} sous-dossier(s)).`,
      )
      return
    }
    if (!window.confirm(`Supprimer le dossier « ${dossier.nom} » ?`)) return
    setErreurAction(null)
    const { error } = await supabase.from('document_dossiers').delete().eq('id', dossier.id)
    if (error) {
      setErreurAction(error.message)
      return
    }
    recharger()
  }

  if (loading) return <EtatChargement lignes={3} hauteur={52} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {erreurAction && <MessageErreur>{erreurAction}</MessageErreur>}

      {/* Onglets des quatre catégories par défaut (demande client du 2026-09-22) : toujours
          visibles, pour changer de catégorie en un clic sans repasser par « Mes documents ».
          Labels complets, jamais tronqués — c'était le reproche fait à l'ancien affichage en
          grille de cartes étroites. */}
      <div role="tablist" aria-label="Catégories de documents" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border-soft)', paddingBottom: 2 }}>
        {onglets.map((o) => {
          const actif = dossierCourantId === o.id
          return (
            <button
              key={o.id}
              role="tab"
              aria-selected={actif}
              onClick={() => setDossierCourantId(o.id)}
              style={{
                padding: '9px 16px',
                borderRadius: '10px 10px 0 0',
                border: 'none',
                borderBottom: actif ? '2px solid var(--accent-gold, #e9cf94)' : '2px solid transparent',
                background: actif ? 'var(--surface-alt)' : 'transparent',
                color: actif ? 'var(--ink)' : 'var(--muted)',
                fontSize: 13,
                fontWeight: actif ? 700 : 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {o.nom}
              {o.compteur > 0 && <span style={{ marginLeft: 7, fontSize: 11, color: 'var(--muted-2)' }}>{o.compteur}</span>}
            </button>
          )
        })}
      </div>

      {/* Fil d'Ariane : la racine est toujours cliquable, y compris quand on est déjà dessus —
          repère stable plutôt qu'un élément qui disparaît selon la profondeur. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
        <button
          onClick={() => setDossierCourantId(null)}
          style={{ ...lienChemin, color: dossierCourantId === null ? 'var(--ink)' : 'var(--accent-blue)' }}
        >
          Mes documents
        </button>
        {dansPartages && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--muted-2)' }}>/</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Mes fichiers partagés</span>
          </span>
        )}
        {chemin.map((d, index) => (
          <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--muted-2)' }}>/</span>
            <button
              onClick={() => setDossierCourantId(d.id)}
              style={{ ...lienChemin, color: index === chemin.length - 1 ? 'var(--ink)' : 'var(--accent-blue)' }}
            >
              {d.nom}
            </button>
          </span>
        ))}
      </div>

      {peutOrganiser && !dansPartages && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {creationOuverte ? (
            <>
              <input
                autoFocus
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') creerDossier()
                  if (e.key === 'Escape') setCreationOuverte(false)
                }}
                placeholder="Nom du dossier"
                style={{ ...champStyle, width: 220 }}
              />
              <button onClick={() => setCreationOuverte(false)} style={boutonNeutreStyle}>
                Annuler
              </button>
              <button
                onClick={creerDossier}
                disabled={enCours || !nouveauNom.trim()}
                className="btn-shine btn-secondary"
                style={{ opacity: enCours || !nouveauNom.trim() ? 0.6 : 1 }}
              >
                {enCours ? 'Création…' : 'Créer'}
              </button>
            </>
          ) : (
            <button onClick={() => setCreationOuverte(true)} style={boutonSecondaireStyle}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icone nom="plus" taille={13} />
                Nouveau dossier
                {chemin.length > 0 ? ` dans « ${chemin[chemin.length - 1].nom} »` : ''}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Sous la racine, les quatre catégories par défaut sont couvertes par les onglets
          ci-dessus : cette grille n'affiche donc que les dossiers personnalisés créés en plus,
          à la racine ou à l'intérieur d'une catégorie. */}
      {((dossierCourantId === null ? racinePersonnalisee.length : enfants.length) > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
          {(dossierCourantId === null ? racinePersonnalisee : enfants).map((d) => {
            const contenu = contenuDe(d)
            return (
              <div
                key={d.id}
                className="card card-lift"
                style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
              >
                <button
                  onClick={() => setDossierCourantId(d.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, flexGrow: 1, minWidth: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <span style={{ color: 'var(--accent-gold, #e9cf94)', flexShrink: 0, display: 'inline-flex' }}>
                    <Icone nom="documents" taille={17} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.nom}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {contenu.fichiers} fichier{contenu.fichiers > 1 ? 's' : ''}
                      {contenu.dossiers > 0 ? ` · ${contenu.dossiers} sous-dossier${contenu.dossiers > 1 ? 's' : ''}` : ''}
                    </span>
                  </span>
                </button>
                {peutOrganiser && (
                  <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => renommer(d)} title="Renommer" style={boutonIcone}>
                      ✎
                    </button>
                    <button onClick={() => supprimerDossier(d)} title="Supprimer" style={{ ...boutonIcone, color: 'var(--danger)' }}>
                      ✕
                    </button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* L'upload vise toujours le dossier ouvert : c'est ce que l'utilisateur a sous les yeux,
          et ça évite un second sélecteur de destination qui dirait la même chose. Rien à
          déposer en revanche dans « Mes fichiers partagés », qui n'est pas un vrai dossier. */}
      {!dansPartages && (
        <UploaderDocument
          ownerProfileId={ownerProfileId}
          etablissementId={etablissementId}
          dossierId={dossierCourantId}
          onUploade={onChange}
          forcerCategorie={forcerCategorie}
          etablissementWide={etablissementWide}
        />
      )}

      <div className="card" style={{ padding: 20 }}>
        <ListeDocuments
          documents={documentsDuDossier}
          /* Un fichier reçu en partage ne se supprime pas : il appartient à quelqu'un d'autre.
             Le destinataire peut seulement retirer le partage, depuis la fenêtre de partage du
             propriétaire — ou demander à ce dernier. */
          peutSupprimer={(d) => !dansPartages && peutSupprimer(d)}
          /* On ne propose de partager que ses propres fichiers, jamais ceux qu'on a reçus. */
          peutPartager={(d) => !dansPartages && d.owner_profile_id === profile?.id}
          mentionPartage={(d) => {
            const partage = partageParDocument.get(d.id)
            return partage ? { par: partage.partage_par_nom ?? 'Hari Online Club', message: partage.message } : null
          }}
          onChange={() => {
            onChange()
            rechargerPartages()
          }}
          messageVide={
            dansPartages
              ? 'Personne ne vous a encore partagé de fichier. Ceux qu’on vous partagera apparaîtront ici.'
              : dossierCourantId
                ? 'Ce dossier ne contient encore aucun fichier. Déposez-en un avec le formulaire ci-dessus.'
                : messageVide
          }
        />
      </div>
    </div>
  )
}

const lienChemin: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  fontSize: 12.5,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const boutonIcone: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--muted)',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
  fontFamily: 'inherit',
}
