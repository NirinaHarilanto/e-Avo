import type { CSSProperties } from 'react'

/* Les trois styles de bouton secondaire de l'application étaient recopiés en style inline à une
   quinzaine d'endroits, avec des paddings et des tailles légèrement différents à chaque fois.
   Le bouton principal, lui, reste la paire de classes `btn-shine btn-primary` d'index.css. */

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  fontSize: 12,
  fontWeight: 700,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '7px 14px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const boutonSecondaireStyle: CSSProperties = { ...base, color: 'var(--accent-blue)' }
export const boutonNeutreStyle: CSSProperties = { ...base, color: 'var(--ink-2)' }
export const boutonDangerStyle: CSSProperties = { ...base, color: 'var(--danger)' }
export const boutonAvertissementStyle: CSSProperties = { ...base, color: 'var(--warning)' }

export const boutonPrimaireStyle: CSSProperties = {
  background: 'var(--accent-gradient)',
  color: '#1b1510',
}
