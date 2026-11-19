import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { champStyle } from './Champ'
import { Icone } from './Icones'

export interface OptionListeChoix {
  /* Chaîne vide acceptée : c'est la valeur d'une option « Aucun(e) » / « Autre », comme un
     <option value=""> natif. */
  id: string
  libelle: ReactNode
}

/* Remplace un <select> natif par une liste dessinée DANS la page — demande client du
   2026-11-05 : « la liste déroulante n'est toujours pas visible », capture à l'appui, après
   TROIS tentatives de corriger le popup natif par CSS (2026-10-10, 2026-10-30, 2026-11-05).
   Dernier diagnostic avant ce composant : les données et les couleurs calculées du popup natif
   étaient saines — mesuré en production — mais le popup réel, dessiné par le système
   d'exploitation hors de la page, restait vide chez le client. Un popup système ne se répare
   pas depuis l'application : rien dans le code ne contrôle ce qui se passe une fois qu'il
   s'ouvre. Cette liste-ci est un <div> ordinaire, soumis aux mêmes règles de couleur et de
   thème que le reste de l'écran — si le reste de l'écran est lisible, elle l'est aussi.

   Usage : remplace <select><option>…</option></select> dans un <Champ label="…"> — le <button>
   déclencheur est un élément « labelable » (comme <select>), `getByLabelText` continue donc de
   le trouver dans les tests. */
export function ListeChoix({
  options,
  valeur,
  onChange,
  placeholder = 'Choisir…',
  disabled = false,
}: {
  options: OptionListeChoix[]
  valeur: string
  onChange: (id: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const [surligne, setSurligne] = useState(0)
  const conteneurRef = useRef<HTMLDivElement>(null)
  const boutonRef = useRef<HTMLButtonElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)
  /* Position de la liste dans la FENÊTRE, pas dans la page : voir le portail plus bas. */
  const [position, setPosition] = useState<{ gauche: number; haut: number; largeur: number; hauteurMax: number } | null>(null)

  /* Mesurée à l'ouverture, puis à chaque défilement ou redimensionnement — une liste en
     `position: fixed` ne suit pas son déclencheur toute seule.

     Elle s'ouvre VERS LE HAUT quand le bas de l'écran est trop proche : sans ce basculement,
     une liste ouverte en bas de fenêtre se retrouve tronquée par le bord de l'écran, ce que le
     portail ne corrige pas à lui seul. */
  const calculerPosition = useCallback(() => {
    const bouton = boutonRef.current
    if (!bouton) return
    const r = bouton.getBoundingClientRect()
    const marge = 8
    const placeDessous = window.innerHeight - r.bottom - marge
    const placeDessus = r.top - marge
    const versLeHaut = placeDessous < 180 && placeDessus > placeDessous
    const hauteurMax = Math.max(120, Math.min(280, versLeHaut ? placeDessus : placeDessous))
    const hauteurListe = listeRef.current?.offsetHeight ?? 0
    setPosition({
      gauche: r.left,
      largeur: r.width,
      haut: versLeHaut ? Math.max(marge, r.top - marge - Math.min(hauteurListe || hauteurMax, hauteurMax)) : r.bottom + 4,
      hauteurMax,
    })
  }, [])

  useLayoutEffect(() => {
    if (!ouvert) {
      setPosition(null)
      return
    }
    calculerPosition()
    /* `true` : on écoute aussi les défilements des conteneurs intermédiaires (le voile de la
       fenêtre modale défile, pas la page). */
    window.addEventListener('scroll', calculerPosition, true)
    window.addEventListener('resize', calculerPosition)
    return () => {
      window.removeEventListener('scroll', calculerPosition, true)
      window.removeEventListener('resize', calculerPosition)
    }
  }, [ouvert, calculerPosition])

  const choisie = options.find((o) => o.id === valeur) ?? null

  useEffect(() => {
    if (!ouvert) return
    function surClicExterieur(e: MouseEvent) {
      /* La liste vit désormais dans un portail, donc HORS du conteneur : la tester séparément,
         sans quoi tout clic sur une option serait pris pour un clic extérieur et refermerait la
         liste avant que le choix ne soit enregistré. */
      const cible = e.target as Node
      if (conteneurRef.current?.contains(cible) || listeRef.current?.contains(cible)) return
      setOuvert(false)
    }
    document.addEventListener('mousedown', surClicExterieur)
    return () => document.removeEventListener('mousedown', surClicExterieur)
  }, [ouvert])

  function ouvrir() {
    setSurligne(Math.max(0, options.findIndex((o) => o.id === valeur)))
    setOuvert(true)
  }

  function choisir(id: string) {
    onChange(id)
    setOuvert(false)
    boutonRef.current?.focus()
  }

  function surTouche(e: KeyboardEvent<HTMLButtonElement>) {
    if (!ouvert) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        ouvrir()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurligne((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurligne((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (options[surligne]) choisir(options[surligne].id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      /* Et SURTOUT : empêcher l'événement d'atteindre la fenêtre modale qui porte cette liste.
         `Modale` écoute Échap au niveau du document (voir son `surEchap`) — sans cet arrêt,
         refermer une liste déroulante refermait la fenêtre entière, et la saisie en cours
         partait avec elle. */
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
      setOuvert(false)
    }
  }

  return (
    <div ref={conteneurRef} style={{ position: 'relative' }}>
      <button
        ref={boutonRef}
        type="button"
        disabled={disabled}
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
        onKeyDown={surTouche}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        style={{
          ...champStyle,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          textAlign: 'left',
          font: 'inherit',
        }}
      >
        <span style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: choisie ? 'var(--ink-2)' : 'var(--muted)' }}>
          {choisie ? choisie.libelle : placeholder}
        </span>
        <Icone nom="chevron" taille={13} style={{ color: 'var(--muted)', transform: ouvert ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .12s' }} />
      </button>

      {/* Montée dans `document.body` plutôt que sous son déclencheur — défaut mesuré en
          production le 2026-11-19, capture client à l'appui : « je ne peux pas voir toutes les
          options possibles ». Le cadre d'une fenêtre modale porte `overflow: hidden` (voir
          Modale.tsx, pour ses coins arrondis) ; une liste en `position: absolute` qui dépasse ce
          cadre est donc ROGNÉE. Mesuré sur la liste des classes : 55 px hors cadre, 3 options
          sur 4 invisibles et inatteignables.

          Le portail rend la liste insensible au conteneur qui l'ouvre, quel qu'il soit — comme
          le fait déjà la fenêtre modale elle-même pour la même raison. Elle est alors positionnée
          en coordonnées de FENÊTRE (`position: fixed`), recalculées au défilement.

          `zIndex` bien au-dessus des fenêtres (300 + profondeur × 10) et de l'aperçu
          d'impression (1000) : une liste ouverte doit passer devant ce qui l'a ouverte. */}
      {ouvert && position &&
        createPortal(
        <div
          ref={listeRef}
          role="listbox"
          style={{
            position: 'fixed',
            zIndex: 2000,
            top: position.haut,
            left: position.gauche,
            width: position.largeur,
            maxHeight: position.hauteurMax,
            overflowY: 'auto',
            borderRadius: 12,
            /* Bord et ombre nettement plus marqués que le reste des surfaces : mesuré en
               production, le fond de la liste (#f7f4ff) et celui de la fenêtre (#fefffa) ne
               présentaient qu'un rapport de contraste de 1,08 — la liste se fondait dans la
               fenêtre, d'où « la liste déroulante n'est pas très visible ». Le texte, lui, était
               déjà à 6,77 : ce n'était pas lui le problème, mais la SÉPARATION du panneau. */
            border: '1px solid var(--ink)',
            background: 'var(--surface-alt)',
            boxShadow: '0 18px 44px rgba(28,17,57,.30), 0 2px 8px rgba(28,17,57,.16)',
            padding: 4,
          }}
        >
          {options.map((o, i) => (
            <button
              key={o.id || '(vide)'}
              type="button"
              role="option"
              aria-selected={o.id === valeur}
              onMouseEnter={() => setSurligne(i)}
              onClick={() => choisir(o.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                font: 'inherit',
                fontSize: 13.5,
                padding: '8px 10px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink-2)',
                background: i === surligne ? 'var(--accent-blue-gradient)' : 'transparent',
              }}
            >
              <span style={{ color: i === surligne ? '#fff' : 'inherit' }}>{o.libelle}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
