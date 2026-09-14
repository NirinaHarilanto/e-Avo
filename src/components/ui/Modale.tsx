import { useEffect, type ReactNode } from 'react'
import { Icone } from './Icones'

interface ModaleProps {
  titre: ReactNode
  onFermer: () => void
  children: ReactNode
  largeurMax?: number
}

/* Fenêtre pop-up générique, sombre, dans le même thème que le reste de l'application.
   Utilisée en premier lieu pour le détail d'un prospect (carte de pipeline repliée par
   défaut), réutilisable partout où une action ponctuelle ne justifie pas une page dédiée. */
export function Modale({ titre, onFermer, children, largeurMax = 480 }: ModaleProps) {
  useEffect(() => {
    function surEchap(e: KeyboardEvent) {
      if (e.key === 'Escape') onFermer()
    }
    document.addEventListener('keydown', surEchap)
    return () => document.removeEventListener('keydown', surEchap)
  }, [onFermer])

  return (
    <div
      onClick={onFermer}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3,7,16,.68)',
        zIndex: 300,
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
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  )
}
