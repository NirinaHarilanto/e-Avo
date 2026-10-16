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
   donc un titre, une explication, et quand c'est possible l'action qui en sort. Sa `description`
   est conservée par la refonte du 2026-10-16, contrairement à celles des titres de page et de
   section : elle ne dit pas quoi faire de l'écran, elle dit pourquoi il est vide — et les
   maquettes en montrent une sur chacun de leurs états vides.

   Cadre en tirets, icône en goutte sur pastille lavande, sans fond : le dessin des maquettes. */
export function EtatVide({ icone = 'vide', titre, description, action, compact }: EtatVideProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 12,
        padding: compact ? '24px 18px' : '36px 20px',
        borderRadius: 20,
        border: '1.5px dashed var(--border)',
        background: 'transparent',
      }}
    >
      <span
        className="petale"
        style={{
          width: compact ? 44 : 56,
          height: compact ? 44 : 56,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--hoc-pastille, rgba(169,140,255,.10))',
          color: 'var(--accent-blue)',
          flexShrink: 0,
        }}
      >
        <Icone nom={icone} taille={compact ? 20 : 24} />
      </span>
      <span style={{ fontSize: compact ? 14 : 15, fontWeight: 700, color: 'var(--ink)' }}>{titre}</span>
      {description && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', maxWidth: 420, lineHeight: 1.6 }}>{description}</p>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}
