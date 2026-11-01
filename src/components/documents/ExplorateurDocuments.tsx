import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { cheminDossier, useDossiersDocuments, type DossierDocument, type PorteeDossiers } from '../../hooks/useDossiersDocuments'
import { useDocumentsPartages } from '../../hooks/useDocumentsPartages'
import { useDossiersPartages } from '../../hooks/useDossiersPartages'
import type { Database, CategorieDocument } from '../../types/database.types'
import { UploaderDocument } from './UploaderDocument'
import { ListeDocuments } from './ListeDocuments'
import { PanneauDossiers } from './PanneauDossiers'
import { PartagerDossierModale } from './PartagerDossierModale'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { champStyle } from '../ui/Champ'

type Document = Database['public']['Tables']['documents']['Row']

/* Sentinelle du dossier virtuel « Mes fichiers partagés » — jamais un uuid réel, donc aucune
   collision possible avec un identifiant de dossier. */
const ID_PARTAGES = '__partages__'

/* Espace documentaire arborescent, partagé par les trois espaces (admin, professeur, étudiant)
   — demande client du 2026-09-21. Un seul composant pour les trois : les règles de visibilité
   sont portées par la RLS (0018 pour les fichiers, 0058 pour les dossiers), pas par l'écran,
   donc rien ne justifierait trois copies qui divergeraient.

   Refondu le 2026-10-31 sur le modèle d'un explorateur de fichiers, à la demande du client :
   « réorganise bien l'arborescence et la mécanique de la gestion de dossier, il doit être
   exactement similaire à la gestion de dossier sur PC ». Concrètement : un panneau de navigation
   à gauche où l'arbre se déplie, le contenu à droite, le clic droit pour renommer / créer /
   partager / supprimer, et le renommage directement sur place. Les pastilles de catégories qui
   tenaient lieu de navigation ont disparu — elles ne montraient que la racine et ne disaient rien
   de la profondeur.

   Un dossier ne donnait historiquement aucun droit (0058, il ne faisait que classer). Ce n'est
   plus vrai depuis 0155 : un dossier PARTAGÉ ouvre son contenu, ses sous-dossiers et ce qu'on y
   déposera, en vue seule ou en écriture. */
export function ExplorateurDocuments({
  documents,
  ownerProfileId,
  etablissementId,
  peutSupprimer,
  onChange,
  peutOrganiser = true,
  peutDeposer = true,
  peutPartager,
  forcerCategorie,
  etablissementWide,
  messageVide,
  portee = 'personnelle',
  titreRacine = 'Mes documents',
}: {
  documents: Document[]
  ownerProfileId: string
  etablissementId: string
  peutSupprimer: (document: Document) => boolean
  onChange: () => void
  /* Qui peut ouvrir la vue de quel fichier à quelqu'un d'autre. Par défaut, ses propres fichiers
     uniquement — la règle de 0059, qui va de soi dans son propre espace documentaire. L'espace
     admin passe autre chose : il consulte l'espace d'un tiers et doit pouvoir y faire circuler une
     pièce (0110). */
  peutPartager?: (document: Document) => boolean
  /* À `false` pour un espace consulté sans pouvoir le réorganiser (un professeur range ses
     propres documents, pas l'arborescence de son élève — voir la policy update de 0058). */
  peutOrganiser?: boolean
  /* Distinct de `peutOrganiser` : ranger et déposer sont deux droits différents, et un même écran
     peut en accorder un sans l'autre. */
  peutDeposer?: boolean
  forcerCategorie?: CategorieDocument
  etablissementWide?: boolean
  messageVide?: string
  /* Quelle arborescence on explore (0149) : l'espace documentaire d'UNE personne, ou celle des
     documents marqués partageables. */
  portee?: PorteeDossiers
  titreRacine?: string
}) {
  const { profile } = useProfileContext()
  const commune = portee === 'etablissement'
  const { dossiers, loading, erreur, recharger } = useDossiersDocuments(ownerProfileId, portee)
  const { partages, recharger: rechargerPartages } = useDocumentsPartages(ownerProfileId)
  /* Dossiers reçus (0155) : seulement dans SON PROPRE espace. Dans l'espace d'un tiers consulté
     par un admin, ou dans la bibliothèque des partageables, afficher « partagés avec moi » n'a
     aucun sens — ce ne sont pas mes dossiers que je regarde. */
  const espacePersonnel = !commune && profile?.id === ownerProfileId
  const {
    racines: dossiersRecus,
    descendance: descendanceRecue,
    recharger: rechargerDossiersRecus,
  } = useDossiersPartages(espacePersonnel ? profile?.id : undefined)

  const [dossierCourantId, setDossierCourantId] = useState<string | null>(null)
  const [creationDansId, setCreationDansId] = useState<string | null | undefined>(undefined)
  const [nouveauNom, setNouveauNom] = useState('')
  const [renommageId, setRenommageId] = useState<string | null>(null)
  const [nomRenomme, setNomRenomme] = useState('')
  const [dossierAPartager, setDossierAPartager] = useState<DossierDocument | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreurAction, setErreurAction] = useState<string | null>(null)
  const champCreation = useRef<HTMLInputElement>(null)

  /* Ce qu'ouvre chaque dossier reçu : la racine partagée porte le niveau, ses descendants en
     héritent — exactement ce que calcule `dossiers_accessibles_par_partage` côté base (0155). Le
     recalculer ici sert l'affichage ; c'est la base, et elle seule, qui autorise. */
  const niveauParDossier = useMemo(() => {
    const niveaux = new Map<string, 'lecture' | 'ecriture'>()
    const tous = [...dossiersRecus.map((r) => r.dossier), ...descendanceRecue]
    for (const { dossier, partage } of dossiersRecus) niveaux.set(dossier.id, partage.niveau)
    for (let tour = 0; tour < 12; tour += 1) {
      for (const d of tous) {
        if (d.parent_id && niveaux.has(d.parent_id) && !niveaux.has(d.id)) {
          niveaux.set(d.id, niveaux.get(d.parent_id)!)
        }
      }
    }
    return niveaux
  }, [dossiersRecus, descendanceRecue])

  const dossiersRecusTous = useMemo(
    () => [...dossiersRecus.map((r) => r.dossier), ...descendanceRecue],
    [dossiersRecus, descendanceRecue],
  )
  const dansDossierRecu = dossierCourantId !== null && niveauParDossier.has(dossierCourantId)

  /* Les fichiers d'un dossier reçu ne sont pas dans `documents` : cette prop ne contient que
     l'espace de `ownerProfileId`. Chargés à l'ouverture du dossier, et seulement alors — précharger
     toutes les arborescences partagées ramènerait des fichiers qu'on ne regardera peut-être
     jamais. */
  const [documentsRecus, setDocumentsRecus] = useState<Document[]>([])
  const [chargementRecus, setChargementRecus] = useState(false)
  const chargerDocumentsRecus = useCallback(async () => {
    if (!dansDossierRecu || !dossierCourantId) return
    setChargementRecus(true)
    const { data } = await supabase.from('documents').select('*').eq('dossier_id', dossierCourantId)
    setDocumentsRecus(data ?? [])
    setChargementRecus(false)
  }, [dansDossierRecu, dossierCourantId])
  useEffect(() => {
    if (dansDossierRecu) chargerDocumentsRecus()
    else setDocumentsRecus([])
  }, [dansDossierRecu, chargerDocumentsRecus])

  const dansPartages = dossierCourantId === ID_PARTAGES
  const arbreCourant = dansDossierRecu ? dossiersRecusTous : dossiers
  const chemin = useMemo(
    () => (dansPartages ? [] : cheminDossier(arbreCourant, dossierCourantId)),
    [arbreCourant, dossierCourantId, dansPartages],
  )
  const documentsDuDossier = useMemo(() => {
    if (dansPartages) return partages.map((p) => p.document)
    if (dansDossierRecu) return documentsRecus
    return documents.filter((d) => (d.dossier_id ?? null) === dossierCourantId)
  }, [documents, dossierCourantId, dansPartages, partages, dansDossierRecu, documentsRecus])
  const partageParDocument = useMemo(() => new Map(partages.map((p) => [p.document.id, p.partage])), [partages])

  const contenuDe = useCallback(
    (dossier: DossierDocument) => ({
      dossiers: dossiers.filter((d) => d.parent_id === dossier.id).length,
      fichiers: documents.filter((d) => d.dossier_id === dossier.id).length,
    }),
    [dossiers, documents],
  )

  /* Déposer dans un dossier reçu n'est possible qu'en écriture ; ailleurs, c'est le droit de
     l'écran qui tranche, comme avant. */
  const peutDeposerIci =
    peutDeposer && !dansPartages && (!dansDossierRecu || niveauParDossier.get(dossierCourantId!) === 'ecriture')
  const peutOrganiserIci = peutOrganiser && !dansDossierRecu

  useEffect(() => {
    if (creationDansId !== undefined) champCreation.current?.focus()
  }, [creationDansId])

  async function creerDossier() {
    if (!profile || !nouveauNom.trim()) return
    setEnCours(true)
    setErreurAction(null)
    const parentId = creationDansId ?? null
    const { error } = await supabase.from('document_dossiers').insert({
      etablissement_id: etablissementId,
      /* Dans la bibliothèque commune, `proprietaire_profile_id` ne dit plus à qui le dossier
         appartient mais seulement qui l'a créé : la colonne est `not null` depuis 0058. */
      proprietaire_profile_id: commune ? profile.id : ownerProfileId,
      etablissement_wide: commune,
      parent_id: parentId,
      nom: nouveauNom.trim(),
      created_by_profile_id: profile.id,
    })
    setEnCours(false)
    if (error) {
      setErreurAction(error.code === '23505' ? 'Un dossier porte déjà ce nom à cet endroit.' : error.message)
      return
    }
    setNouveauNom('')
    setCreationDansId(undefined)
    recharger()
  }

  /* Renommage sur place et non plus par `window.prompt` : sur un PC, le nom devient éditable là
     où il est affiché. La boîte de dialogue du navigateur, en plus d'être hors charte, vidait le
     contexte de l'arborescence le temps de la saisie. */
  async function validerRenommage(dossier: DossierDocument) {
    const nom = nomRenomme.trim()
    setRenommageId(null)
    if (!nom || nom === dossier.nom) return
    setErreurAction(null)
    const { error } = await supabase.from('document_dossiers').update({ nom }).eq('id', dossier.id)
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
    if (dossierCourantId === dossier.id) setDossierCourantId(dossier.parent_id)
    recharger()
  }

  if (loading) return <EtatChargement lignes={3} hauteur={52} />

  const dossierCourant = arbreCourant.find((d) => d.id === dossierCourantId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {erreurAction && <MessageErreur>{erreurAction}</MessageErreur>}

      {/* Deux colonnes au-delà de 760 px, empilées en dessous : sur un téléphone, un panneau
          latéral de 240 px ne laisserait pas de quoi lire un nom de fichier. */}
      <div className="explorateur-documents">
        <PanneauDossiers
          dossiers={dossiers}
          dossierCourantId={dossierCourantId}
          titreRacine={titreRacine}
          compteurDe={contenuDe}
          partagesRecus={dossiersRecus}
          descendancePartagee={descendanceRecue}
          nombreFichiersRecus={partages.length}
          idPartages={ID_PARTAGES}
          peutOrganiser={peutOrganiser}
          actions={{
            onOuvrir: (id) => {
              setDossierCourantId(id)
              setRenommageId(null)
            },
            ...(peutOrganiser
              ? {
                  onNouveauSousDossier: (parentId: string | null) => {
                    setCreationDansId(parentId)
                    setNouveauNom('')
                    if (parentId !== null) setDossierCourantId(parentId)
                  },
                  onRenommer: (dossier: DossierDocument) => {
                    setRenommageId(dossier.id)
                    setNomRenomme(dossier.nom)
                    setDossierCourantId(dossier.id)
                  },
                  onSupprimer: supprimerDossier,
                }
              : {}),
            onPartager: (dossier: DossierDocument) => setDossierAPartager(dossier),
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Fil d'Ariane : la racine est toujours cliquable, y compris quand on est déjà dessus —
              repère stable plutôt qu'un élément qui disparaît selon la profondeur. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
            <button
              onClick={() => setDossierCourantId(null)}
              style={{ ...lienChemin, color: dossierCourantId === null ? 'var(--ink)' : 'var(--accent-blue)' }}
            >
              {titreRacine}
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
                {renommageId === d.id ? (
                  <input
                    autoFocus
                    value={nomRenomme}
                    onChange={(e) => setNomRenomme(e.target.value)}
                    onBlur={() => validerRenommage(d)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') validerRenommage(d)
                      if (e.key === 'Escape') setRenommageId(null)
                    }}
                    style={{ ...champStyle, height: 28, width: 190, fontSize: 12.5 }}
                  />
                ) : (
                  <button
                    onClick={() => setDossierCourantId(d.id)}
                    onDoubleClick={() => {
                      if (!peutOrganiserIci) return
                      setRenommageId(d.id)
                      setNomRenomme(d.nom)
                    }}
                    style={{ ...lienChemin, color: index === chemin.length - 1 ? 'var(--ink)' : 'var(--accent-blue)' }}
                  >
                    {d.nom}
                  </button>
                )}
              </span>
            ))}
            {dansDossierRecu && (
              <span
                style={{
                  marginLeft: 4,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: 'var(--accent-teal)',
                  background: 'color-mix(in srgb, var(--accent-teal) 14%, transparent)',
                  borderRadius: 999,
                  padding: '2px 9px',
                }}
              >
                Partagé avec vous ·{' '}
                {niveauParDossier.get(dossierCourantId!) === 'ecriture' ? 'vue et écriture' : 'vue seule'}
              </span>
            )}
          </div>

          {creationDansId !== undefined && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                ref={champCreation}
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') creerDossier()
                  if (e.key === 'Escape') setCreationDansId(undefined)
                }}
                placeholder={
                  creationDansId === null ? 'Nom du dossier' : `Nom du sous-dossier`
                }
                style={{ ...champStyle, width: 230 }}
              />
              <button onClick={() => setCreationDansId(undefined)} style={boutonTexte}>
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
            </div>
          )}

          {/* L'upload vise toujours le dossier ouvert : c'est ce que l'utilisateur a sous les yeux,
              et ça évite un second sélecteur de destination qui dirait la même chose. */}
          {peutDeposerIci && (
            <UploaderDocument
              /* Dans un dossier reçu, le fichier entre dans l'espace de son PROPRIÉTAIRE, pas dans
                 le mien : c'est son dossier que j'alimente. La base exige exactement cela (0155),
                 un `owner_profile_id` différent serait refusé. */
              ownerProfileId={dansDossierRecu ? (dossierCourant?.proprietaire_profile_id ?? ownerProfileId) : ownerProfileId}
              etablissementId={etablissementId}
              dossierId={dossierCourantId}
              onUploade={dansDossierRecu ? chargerDocumentsRecus : onChange}
              forcerCategorie={forcerCategorie}
              etablissementWide={dansDossierRecu ? false : etablissementWide}
            />
          )}

          <div className="card" style={{ padding: 20 }}>
            {chargementRecus ? (
              <EtatChargement lignes={2} hauteur={46} />
            ) : (
              <ListeDocuments
                documents={documentsDuDossier}
                /* Gouverne uniquement la suppression RÉELLE. Reste `false` dans « Mes fichiers
                   partagés » et dans un dossier reçu : un fichier qu'on nous laisse voir ne nous
                   appartient pas. Retirer SA PROPRE vue passe par un chemin indépendant de cette
                   prop (règle client du 2026-10-10). */
                peutSupprimer={(d) => !dansPartages && !dansDossierRecu && peutSupprimer(d)}
                /* Tout fichier visible est partageable, y compris reçu en partage — sens littéral
                   de la règle posée le 2026-10-10 (0111). La base applique la même règle. */
                peutPartager={peutPartager ?? (() => true)}
                mentionPartage={(d) => {
                  const partage = partageParDocument.get(d.id)
                  return partage ? { par: partage.partage_par_nom ?? 'Hari Online Club', message: partage.message } : null
                }}
                onChange={() => {
                  onChange()
                  rechargerPartages()
                  if (dansDossierRecu) chargerDocumentsRecus()
                }}
                messageVide={
                  dansPartages
                    ? 'Personne ne vous a encore partagé de fichier. Ceux qu’on vous partagera apparaîtront ici.'
                    : dossierCourantId
                      ? peutDeposerIci
                        ? 'Ce dossier ne contient encore aucun fichier. Déposez-en un avec le formulaire ci-dessus.'
                        : 'Ce dossier ne contient encore aucun fichier.'
                      : messageVide
                }
              />
            )}
          </div>
        </div>
      </div>

      {dossierAPartager && (
        <PartagerDossierModale
          dossier={dossierAPartager}
          onFermer={() => setDossierAPartager(null)}
          onChange={() => {
            recharger()
            rechargerDossiersRecus()
          }}
        />
      )}
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

const boutonTexte: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--muted)',
  fontFamily: 'inherit',
  cursor: 'pointer',
}
