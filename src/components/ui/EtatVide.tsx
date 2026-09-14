import type { ReactNode } from 'react'
import { Icone, type NomIcone } from './Icones'

interface EtatVideProps {
  icone?: NomIcone
  titre: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}

/* Un état vide qui dit seulement « Aucun document. » laisse l'utilisateur sans issue : il ne
   sait ni pourquoi c'est vide, ni comment le remplir. Chaque état vide de l'application porte
   donc un titre, une explication, et quand c'est possible l'action qui en sort. */
export function EtatVide({ icone = 'vide', titre, description, action, compact }: EtatVideProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 9,
        padding: compact ? '22px 18px' : '38px 24px',
        borderRadius: 16,
        border: '1px dashed var(--border)',
        background: 'rgba(255,255,255,.02)',
      }}
    >
      <span
        style={{
          width: compact ? 38 : 46,
          height: compact ? 38 : 46,
          borderRadius: 14,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(94,179,255,.10)',
          border: '1px solid rgba(94,179,255,.22)',
          color: 'var(--accent-blue)',
        }}
      >
        <Icone nom={icone} taille={compact ? 19 : 23} />
      </span>
      <span className="brand-font" style={{ fontSize: compact ? 14 : 16, color: 'var(--ink)' }}>
        {titre}
      </span>
      {description && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', maxWidth: 420, lineHeight: 1.6 }}>{description}</p>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}
