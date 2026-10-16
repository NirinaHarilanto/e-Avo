import type { CSSProperties, ReactNode } from 'react'

interface SectionProps {
  titre?: ReactNode
  actions?: ReactNode
  compteur?: ReactNode
  children: ReactNode
  padding?: number | string
  style?: CSSProperties
  /* Variante resserrée pour le pôle Pédagogie de l'espace admin — titre et marges réduits,
     aucune information retirée. */
  compact?: boolean
}

/* `description` a été retirée des deux composants le 2026-10-16, à la demande du client : « enlever
   les instructions pour l'utilisateur en début de chaque section ». Ces phrases expliquaient quoi
   faire de la section (« Les documents que vous déposez… », « Rédigés par votre professeur après
   chaque séance… ») et aucune maquette de la refonte n'en montre. À ne pas confondre avec la
   `description` d'`EtatVide`, conservée : celle-là dit ce qui se passe quand il n'y a rien à
   afficher, c'est une information, pas une consigne. */

/* Bloc de contenu titré. Remplace les `className="card"` + `<h2>` doré recomposés à la main
   dans chaque page, dont les tailles de titre (15/16/17/19) et les marges avaient divergé. */
export function Section({ titre, actions, compteur, children, padding, style, compact }: SectionProps) {
  return (
    <section className="card card-section" style={{ padding: padding ?? (compact ? 14 : '24px 28px'), minWidth: 0, ...style }}>
      {(titre || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: compact ? 10 : 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: compact ? 15 : 20, fontWeight: 700, color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              {titre}
              {compteur !== undefined && compteur !== null && (
                <span
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--accent-blue)',
                    background: 'var(--hoc-pastille, rgba(255,255,255,.07))',
                    borderRadius: 999,
                    padding: '3px 10px',
                  }}
                >
                  {compteur}
                </span>
              )}
            </h2>
          </div>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* Variante sans carte, pour regrouper des blocs déjà porteurs de leur propre fond. */
export function GroupeSection({
  titre,
  actions,
  children,
  compact,
}: Omit<SectionProps, 'padding' | 'style' | 'compteur'>) {
  return (
    <section style={{ minWidth: 0 }}>
      {(titre || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: compact ? 9 : 14 }}>
          <h2 style={{ fontSize: compact ? 15 : 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{titre}</h2>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
