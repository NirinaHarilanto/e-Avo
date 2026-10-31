import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { DossierDocument } from '../../hooks/useDossiersDocuments'
import type { DossierRecu } from '../../hooks/useDossiersPartages'

/* Panneau de navigation de l'espace documentaire — demande client du 2026-10-31 : « on doit
   avoir visuellement un panel de navigation [...] exactement comme sur un dossier de mon PC ».

   Il remplace les pastilles de catégories qui tenaient lieu de navigation : celles-ci ne
   montraient que la racine, sans jamais laisser voir la profondeur de l'arborescence. Ici l'arbre
   se déplie, le dossier ouvert reste visible dans son contexte, et le clic droit ouvre les mêmes
   actions qu'un explorateur de fichiers. */

export interface ActionsDossier {
  onOuvrir: (id: string | null) => void
  onRenommer?: (dossier: DossierDocument) => void
  onSupprimer?: (dossier: DossierDocument) => void
  onNouveauSousDossier?: (parentId: string | null) => void
  onPartager?: (dossier: DossierDocument) => void
}

interface Compteur {
  fichiers: number
  dossiers: number
}

export function PanneauDossiers({
  dossiers,
  dossierCourantId,
  titreRacine,
  compteurDe,
  actions,
  partagesRecus,
  descendancePartagee,
  nombreFichiersRecus,
  idPartages,
  peutOrganiser,
}: {
  dossiers: DossierDocument[]
  dossierCourantId: string | null
  titreRacine: string
  compteurDe: (dossier: DossierDocument) => Compteur
  actions: ActionsDossier
  /* Dossiers qu'on m'a partagés (0155) : affichés dans leur propre section, parce qu'ils ne sont
     pas à moi — je les parcours, je n'y range pas mon propre classement. */
  partagesRecus: DossierRecu[]
  descendancePartagee: DossierDocument[]
  nombreFichiersRecus: number
  idPartages: string
  peutOrganiser: boolean
}) {
  /* Dépliage : seuls les dossiers explicitement ouverts le sont, comme dans un explorateur.
     L'ancêtre du dossier courant s'ouvre tout seul (voir `useEffect`), pour qu'on ne perde jamais
     de vue où l'on se trouve après une navigation depuis le fil d'Ariane. */
  const [deplies, setDeplies] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ dossier: DossierDocument; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!dossierCourantId) return
    const parId = new Map(dossiers.map((d) => [d.id, d]))
    const aOuvrir = new Set<string>()
    let courant = parId.get(dossierCourantId)
    let garde = 0
    while (courant?.parent_id && garde < 50) {
      aOuvrir.add(courant.parent_id)
      courant = parId.get(courant.parent_id)
      garde += 1
    }
    if (aOuvrir.size > 0) setDeplies((d) => new Set([...d, ...aOuvrir]))
  }, [dossierCourantId, dossiers])

  function basculer(id: string) {
    setDeplies((d) => {
      const suivant = new Set(d)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })
  }

  const idsPartages = new Set(partagesRecus.map((p) => p.dossier.id))
  const tousPartages = [...partagesRecus.map((p) => p.dossier), ...descendancePartagee]

  function rendreBranche(dossier: DossierDocument, profondeur: number, arbre: DossierDocument[]): ReactNode {
    const enfants = arbre.filter((d) => d.parent_id === dossier.id)
    const ouvert = deplies.has(dossier.id)
    const actif = dossierCourantId === dossier.id
    const compteur = compteurDe(dossier)
    return (
      <div key={dossier.id}>
        <div
          onClick={() => actions.onOuvrir(dossier.id)}
          onContextMenu={(e) => {
            /* Clic droit, « exactement comme sur un dossier de mon PC » : on remplace le menu du
               navigateur par celui de l'application. Positionné au curseur et refermé au moindre
               clic ailleurs ou sur Échap. */
            e.preventDefault()
            e.stopPropagation()
            setMenu({ dossier, x: e.clientX, y: e.clientY })
          }}
          style={{ ...ligneStyle(actif), paddingLeft: 8 + profondeur * 14 }}
          title={dossier.nom}
        >
          <button
            type="button"
            aria-label={ouvert ? 'Replier' : 'Déplier'}
            onClick={(e) => {
              e.stopPropagation()
              basculer(dossier.id)
            }}
            style={chevronStyle(enfants.length === 0)}
          >
            <Chevron ouvert={ouvert} />
          </button>
          <IconeDossier ouvert={ouvert || actif} />
          <span style={nomStyle}>{dossier.nom}</span>
          {compteur.fichiers > 0 && <span style={compteurStyle}>{compteur.fichiers}</span>}
        </div>
        {ouvert && enfants.map((enfant) => rendreBranche(enfant, profondeur + 1, arbre))}
      </div>
    )
  }

  const racine = dossiers.filter((d) => d.parent_id === null)

  return (
    <nav
      aria-label="Navigation des dossiers"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '10px 8px',
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--surface-alt)',
        /* Le panneau défile seul quand l'arborescence est longue : la liste de fichiers à droite
           garde sa propre hauteur, comme dans un explorateur. La hauteur minimale lui donne sa
           présence de colonne même avec deux dossiers — sans elle, il se réduit à un entrefilet
           posé au-dessus du vide et ne se lit plus comme un panneau de navigation. */
        minHeight: 240,
        maxHeight: 460,
        overflowY: 'auto',
      }}
    >
      <div
        onClick={() => actions.onOuvrir(null)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        style={{ ...ligneStyle(dossierCourantId === null), paddingLeft: 8, fontWeight: 700 }}
      >
        <span style={{ width: 16, flexShrink: 0 }} />
        <IconeDossier ouvert racine />
        <span style={nomStyle}>{titreRacine}</span>
      </div>

      {racine.map((d) => rendreBranche(d, 1, dossiers))}

      {peutOrganiser && (
        <button
          type="button"
          onClick={() => actions.onNouveauSousDossier?.(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            marginTop: 4,
            padding: '7px 8px',
            borderRadius: 9,
            border: '1px dashed var(--border)',
            background: 'transparent',
            color: 'var(--accent-blue)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          Nouveau dossier
        </button>
      )}

      <div style={{ height: 1, background: 'var(--border-soft)', margin: '10px 2px 8px' }} />

      <div
        onClick={() => actions.onOuvrir(idPartages)}
        style={ligneStyle(dossierCourantId === idPartages)}
      >
        <span style={{ width: 16, flexShrink: 0 }} />
        <IconePartage />
        <span style={nomStyle}>Mes fichiers partagés</span>
        {nombreFichiersRecus > 0 && <span style={compteurStyle}>{nombreFichiersRecus}</span>}
      </div>

      {partagesRecus.length > 0 && (
        <>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: 'var(--muted-2)',
              padding: '10px 8px 4px',
            }}
          >
            Partagés avec moi
          </span>
          {partagesRecus.map(({ dossier, partage }) => (
            <div key={dossier.id}>
              <div
                onClick={() => actions.onOuvrir(dossier.id)}
                style={ligneStyle(dossierCourantId === dossier.id)}
                title={`Partagé par ${partage.partage_par_nom ?? 'Hari Online Club'}`}
              >
                <button
                  type="button"
                  aria-label={deplies.has(dossier.id) ? 'Replier' : 'Déplier'}
                  onClick={(e) => {
                    e.stopPropagation()
                    basculer(dossier.id)
                  }}
                  style={chevronStyle(!tousPartages.some((d) => d.parent_id === dossier.id))}
                >
                  <Chevron ouvert={deplies.has(dossier.id)} />
                </button>
                <IconeDossier ouvert={deplies.has(dossier.id)} partage />
                <span style={nomStyle}>{dossier.nom}</span>
                {partage.niveau === 'ecriture' && (
                  <span
                    style={{ ...compteurStyle, color: 'var(--accent-teal)', background: 'color-mix(in srgb, var(--accent-teal) 14%, transparent)' }}
                    title="Vous pouvez déposer dans ce dossier"
                  >
                    écriture
                  </span>
                )}
              </div>
              {deplies.has(dossier.id) &&
                tousPartages
                  .filter((d) => d.parent_id === dossier.id)
                  .map((enfant) => rendreBrancheSimple(enfant, 2, tousPartages, deplies, basculer, dossierCourantId, actions))}
            </div>
          ))}
        </>
      )}

      {menu && (
        <MenuContextuel
          x={menu.x}
          y={menu.y}
          onFermer={() => setMenu(null)}
          entrees={[
            { libelle: 'Ouvrir', action: () => actions.onOuvrir(menu.dossier.id) },
            ...(idsPartages.has(menu.dossier.id)
              ? []
              : [
                  ...(actions.onNouveauSousDossier
                    ? [{ libelle: 'Nouveau sous-dossier', action: () => actions.onNouveauSousDossier!(menu.dossier.id) }]
                    : []),
                  ...(actions.onRenommer
                    ? [{ libelle: 'Renommer', action: () => actions.onRenommer!(menu.dossier) }]
                    : []),
                  ...(actions.onPartager
                    ? [{ libelle: 'Partager…', action: () => actions.onPartager!(menu.dossier) }]
                    : []),
                  ...(actions.onSupprimer
                    ? [{ libelle: 'Supprimer', action: () => actions.onSupprimer!(menu.dossier), danger: true }]
                    : []),
                ]),
          ]}
        />
      )}
    </nav>
  )
}

/* Branche d'un dossier REÇU : même dessin, sans aucune action de rangement — on ne réorganise pas
   le classement de quelqu'un d'autre (c'est aussi ce que dit la base, qui n'accorde à l'invité ni
   `update` ni `delete`, voir 0155). */
function rendreBrancheSimple(
  dossier: DossierDocument,
  profondeur: number,
  arbre: DossierDocument[],
  deplies: Set<string>,
  basculer: (id: string) => void,
  dossierCourantId: string | null,
  actions: ActionsDossier,
): ReactNode {
  const enfants = arbre.filter((d) => d.parent_id === dossier.id)
  const ouvert = deplies.has(dossier.id)
  return (
    <div key={dossier.id}>
      <div
        onClick={() => actions.onOuvrir(dossier.id)}
        style={{ ...ligneStyle(dossierCourantId === dossier.id), paddingLeft: 8 + profondeur * 14 }}
      >
        <button
          type="button"
          aria-label={ouvert ? 'Replier' : 'Déplier'}
          onClick={(e) => {
            e.stopPropagation()
            basculer(dossier.id)
          }}
          style={chevronStyle(enfants.length === 0)}
        >
          <Chevron ouvert={ouvert} />
        </button>
        <IconeDossier ouvert={ouvert} partage />
        <span style={nomStyle}>{dossier.nom}</span>
      </div>
      {ouvert &&
        enfants.map((e) => rendreBrancheSimple(e, profondeur + 1, arbre, deplies, basculer, dossierCourantId, actions))}
    </div>
  )
}

function MenuContextuel({
  x,
  y,
  entrees,
  onFermer,
}: {
  x: number
  y: number
  entrees: { libelle: string; action: () => void; danger?: boolean }[]
  onFermer: () => void
}) {
  useEffect(() => {
    const fermer = () => onFermer()
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer()
    }
    /* `click` et non `mousedown` : le clic qui vient d'ouvrir le menu ne doit pas le refermer
       aussitôt. Le `scroll` en capture attrape aussi le défilement du panneau, sinon le menu
       resterait planté à une position qui ne désigne plus rien. */
    document.addEventListener('click', fermer)
    document.addEventListener('contextmenu', fermer)
    document.addEventListener('keydown', surTouche)
    window.addEventListener('scroll', fermer, true)
    return () => {
      document.removeEventListener('click', fermer)
      document.removeEventListener('contextmenu', fermer)
      document.removeEventListener('keydown', surTouche)
      window.removeEventListener('scroll', fermer, true)
    }
  }, [onFermer])

  /* Replié vers l'intérieur quand le curseur est près d'un bord : un menu ouvert en bas à droite
     sortirait sinon de l'écran, sans moyen d'atteindre ses dernières entrées. */
  const largeur = 208
  const hauteur = entrees.length * 34 + 12
  const gauche = Math.min(x, window.innerWidth - largeur - 8)
  const haut = Math.min(y, window.innerHeight - hauteur - 8)

  return (
    <div
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left: Math.max(8, gauche),
        top: Math.max(8, haut),
        zIndex: 1200,
        width: largeur,
        padding: '6px 0',
        borderRadius: 11,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        boxShadow: '0 12px 32px rgba(28, 17, 57, 0.18)',
      }}
    >
      {entrees.map((entree) => (
        <button
          key={entree.libelle}
          type="button"
          role="menuitem"
          onClick={() => {
            entree.action()
            onFermer()
          }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 14px',
            border: 'none',
            background: 'transparent',
            color: entree.danger ? 'var(--danger)' : 'var(--ink)',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-alt)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {entree.libelle}
        </button>
      ))}
    </div>
  )
}

/* Icônes en SVG `currentColor` et non en glyphes : un caractère Unicode de dossier est rendu en
   emoji couleur par Segoe UI Emoji sous Windows, qui ignore `color` — déjà constaté sur ⚠. */
function IconeDossier({ ouvert, partage, racine }: { ouvert?: boolean; partage?: boolean; racine?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      style={{ flexShrink: 0, color: partage ? 'var(--accent-teal)' : racine ? 'var(--accent-blue)' : 'var(--accent-gold, #e9cf94)' }}
    >
      <path
        d="M1.5 3.6c0-.6.5-1.1 1.1-1.1h3.1c.4 0 .7.2.9.5l.6 1h5.2c.6 0 1.1.5 1.1 1.1v7.3c0 .6-.5 1.1-1.1 1.1H2.6c-.6 0-1.1-.5-1.1-1.1V3.6Z"
        fill={ouvert ? 'currentColor' : 'none'}
        fillOpacity={ouvert ? 0.22 : 0}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconePartage() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0, color: 'var(--accent-teal)' }}>
      <circle cx="12" cy="3.6" r="2.1" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="12.4" r="2.1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.9 7 10.1 4.6M5.9 9l4.2 2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function Chevron({ ouvert }: { ouvert: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      style={{ transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}
    >
      <path d="m3.4 2 3.2 3-3.2 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ligneStyle = (actif: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '6px 8px',
  borderRadius: 8,
  cursor: 'pointer',
  background: actif ? 'color-mix(in srgb, var(--accent-blue) 13%, transparent)' : 'transparent',
  color: actif ? 'var(--accent-blue)' : 'var(--ink-2)',
  fontSize: 12.5,
  fontWeight: actif ? 700 : 500,
  userSelect: 'none',
})

const chevronStyle = (invisible: boolean): CSSProperties => ({
  width: 16,
  height: 16,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  padding: 0,
  color: 'var(--muted-2)',
  cursor: invisible ? 'default' : 'pointer',
  visibility: invisible ? 'hidden' : 'visible',
})

const nomStyle: CSSProperties = {
  flexGrow: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const compteurStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 10.5,
  fontWeight: 700,
  color: 'var(--muted)',
  background: 'var(--surface)',
  borderRadius: 999,
  padding: '1px 7px',
}
