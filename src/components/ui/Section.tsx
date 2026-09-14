import type { CSSProperties, ReactNode } from 'react'

interface SectionProps {
  titre?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  compteur?: ReactNode
  children: ReactNode
  padding?: number | string
  style?: CSSProperties
  /* Variante resserrée pour le pôle Pédagogie de l'espace admin — titre, description et marges
     réduits, aucune information retirée. */
  compact?: boolean
}

/* Bloc de contenu titré. Remplace les `className="card"` + `<h2>` doré recomposés à la main
   dans chaque page, dont les tailles de titre (15/16/17/19) et les marges avaient divergé. */
export function Section({ titre, description, actions, compteur, children, padding, style, compact }: SectionProps) {
  return (
    <section className="card" style={{ padding: padding ?? (compact ? 14 : 20), minWidth: 0, ...style }}>
      {(titre || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: description ? 4 : compact ? 8 : 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: compact ? 13.5 : 16, color: 'var(--accent-gold, #e9cf94)', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
              {titre}
              {compteur !== undefined && compteur !== null && (
                <span
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'var(--ink-2)',
                    background: 'rgba(255,255,255,.07)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 999,
                    padding: '2px 9px',
                  }}
                >
                  {compteur}
                </span>
              )}
            </h2>
          </div>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      {description && (
        <p style={{ margin: compact ? '0 0 8px' : '0 0 14px', fontSize: compact ? 11 : 12, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 620 }}>
          {description}
        </p>
      )}
      {children}
    </section>
  )
}

/* Variante sans carte, pour regrouper des blocs déjà porteurs de leur propre fond. */
export function GroupeSection({
  titre,
  description,
  actions,
  children,
  compact,
}: Omit<SectionProps, 'padding' | 'style' | 'compteur'>) {
  return (
    <section style={{ minWidth: 0 }}>
      {(titre || actions) && (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: description ? 4 : compact ? 7 : 12 }}>
          <h2 style={{ fontSize: compact ? 14 : 17, color: 'var(--accent-gold, #e9cf94)', margin: 0 }}>{titre}</h2>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      {description && (
        <p style={{ margin: compact ? '0 0 8px' : '0 0 12px', fontSize: compact ? 11 : 12, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 620 }}>
          {description}
        </p>
      )}
      {children}
    </section>
  )
}
