import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icone } from './Icones'

interface ModaleProps {
  titre: ReactNode
  onFermer: () => void
  children: ReactNode
  largeurMax?: number
  /* Désactive la fermeture par clic à l'extérieur ET par Échap — seule la croix en haut à droite
     ferme alors la fenêtre (demande client du 2026-09-30, pour les checklists : « le seul moyen
     de quitter la checklist [doit être] le petit croix en haut à droite. Toute clique à
     l'extérieure ne la fermera pas »). Un clic accidentel en dehors d'une longue évaluation en
     cours de saisie (fiche candidat, par exemple) ne doit jamais la faire disparaître. Faux par
     défaut : ce comportement reste l'exception, pas la règle, pour les popups ponctuelles de
     l'application (confirmation, détail en lecture seule…) où fermer d'un clic extérieur est un
     raccourci attendu. */
  fermetureExterieureDesactivee?: boolean
}

/* Rang d'empilement d'une fenêtre parmi celles déjà ouvertes : la fiche d'un prospect ouvre
   elle-même la fenêtre de paiement ou de planification par-dessus elle. Tant qu'une fenêtre
   imbriquée était rendue dans le cadre de sa parente, elle passait forcément devant ; depuis
   qu'elles sont toutes montées côte à côte dans `document.body` (voir le portail plus bas), React
   y insère l'imbriquée AVANT sa parente — à z-index égal, la parente lui passerait devant et
   masquerait la fenêtre qu'on vient d'ouvrir. La profondeur, transmise par contexte le long de
   l'arbre React (que les portails conservent), rétablit l'ordre attendu. */
const ProfondeurModale = createContext(0)

/* Fenêtre pop-up générique, dans le même thème que le reste de l'application — clair dans les
   trois espaces depuis le 2026-10-16, le portail restant un descendant de `body`, qui porte la
   classe de thème. Utilisée en premier lieu pour le détail d'un prospect (carte de pipeline
   repliée par défaut), réutilisable partout où une action ponctuelle ne justifie pas une page
   dédiée. */
export function Modale({ titre, onFermer, children, largeurMax = 480, fermetureExterieureDesactivee = false }: ModaleProps) {
  const voile = useRef<HTMLDivElement>(null)
  const profondeur = useContext(ProfondeurModale)

  useEffect(() => {
    if (fermetureExterieureDesactivee) return
    /* Échap ne referme que la fenêtre du dessus : les deux écoutent `document`, sans ce filtre
       elles se fermeraient ensemble et l'admin perdrait la fiche à chaque acompte saisi. Le rang
       est relu dans le DOM au moment de la frappe — une pile alimentée au montage donnerait
       l'ordre inverse, React montant les effets de l'enfant vers le parent. */
    function surEchap(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      let dessus: Element | null = null
      let rangDessus = -1
      for (const ouverte of document.querySelectorAll('[data-modale]')) {
        const rang = Number(ouverte.getAttribute('data-modale'))
        if (rang >= rangDessus) {
          dessus = ouverte
          rangDessus = rang
        }
      }
      if (dessus === voile.current) onFermer()
    }
    document.addEventListener('keydown', surEchap)
    return () => document.removeEventListener('keydown', surEchap)
  }, [onFermer, fermetureExterieureDesactivee])

  /* Monté dans `document.body` plutôt qu'à l'endroit où le composant est écrit : un ancêtre
     portant `transform` (`.card-lift:hover` soulève la carte de 2 px) devient le bloc conteneur
     de ses descendants `position: fixed`, qui se retrouvent alors dimensionnés et rognés par la
     carte au lieu de couvrir la fenêtre. C'est ce qui écrasait le pop-up d'un binôme DUO, dont
     la fiche est imbriquée dans la carte du groupe (0058) — le portail rend la fenêtre
     insensible au contexte de rendu de son appelant, quel qu'il soit. */
  return createPortal(
    <div
      ref={voile}
      data-modale={profondeur}
      onClick={fermetureExterieureDesactivee ? undefined : onFermer}
      style={{
        position: 'fixed',
        inset: 0,
        /* Voile violet à 42 % plutôt que le noir à 68 % du thème sombre : sur une page claire,
           un voile aussi dense éteint complètement l'écran derrière la fenêtre. */
        background: 'var(--voile-modale, rgba(8,4,18,.68))',
        zIndex: 300 + profondeur * 10,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 20px',
        overflowY: 'auto',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof titre === 'string' ? titre : undefined}
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: largeurMax, padding: 0, overflow: 'hidden' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          <span className="brand-font" style={{ fontSize: 15.5, color: 'var(--ink)', minWidth: 0 }}>
            {titre}
          </span>
          <button
            onClick={onFermer}
            aria-label="Fermer"
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'inline-flex', flexShrink: 0 }}
          >
            <Icone nom="fermer" taille={18} />
          </button>
        </div>
        <div style={{ padding: 18 }}>
          <ProfondeurModale.Provider value={profondeur + 1}>{children}</ProfondeurModale.Provider>
        </div>
      </div>
    </div>,
    document.body,
  )
}
