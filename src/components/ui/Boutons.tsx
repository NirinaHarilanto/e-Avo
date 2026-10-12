import type { CSSProperties, ReactNode } from 'react'

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

/* Un clic qui déclenche un appel réseau doit TOUJOURS se voir — demande client du 2026-10-12,
   capture à l'appui : « Annuler la séance » désactivait bien le bouton en interne, mais rien ne le
   montrait à l'écran, confondu avec un bug. Ce composant applique systématiquement le même
   triptyque déjà en usage ailleurs dans le code (EditerSeancePlanifieeModale.tsx,
   ModaleConfirmation.tsx) : désactivé + opacité réduite + libellé qui bascule au participe présent
   pendant l'attente — à utiliser pour tout bouton déclenchant une action asynchrone. */
export function Bouton({
  onClick,
  enCours = false,
  disabled,
  libelle,
  libelleEnCours,
  style = boutonNeutreStyle,
  type = 'button',
  className,
}: {
  onClick: () => void
  enCours?: boolean
  disabled?: boolean
  libelle: ReactNode
  libelleEnCours?: ReactNode
  style?: CSSProperties
  type?: 'button' | 'submit'
  className?: string
}) {
  const texteEnCours = libelleEnCours ?? (typeof libelle === 'string' ? `${libelle}…` : libelle)
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || enCours}
      className={className}
      style={{ ...style, opacity: enCours || disabled ? 0.6 : 1 }}
    >
      {enCours ? texteEnCours : libelle}
    </button>
  )
}
