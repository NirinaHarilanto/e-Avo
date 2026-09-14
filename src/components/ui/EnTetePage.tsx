import type { ReactNode } from 'react'

interface EnTetePageProps {
  titre: ReactNode
  description?: ReactNode
  actions?: ReactNode
  media?: ReactNode
  avant?: ReactNode
  /* Variante resserrée pour le pôle Pédagogie de l'espace admin, dont les pages doivent tenir
     dans une seule vue — la description reste affichée, seule sa mise en avant est réduite. */
  compact?: boolean
}

/* En-tête unique des pages des quatre espaces. Il en existait trois variantes divergentes
   (flex/center + marge 18, flex/flex-end + marge 22, `<h1>` nu) et neuf pages sur vingt-cinq
   n'avaient aucune phrase d'explication : `description` est volontairement mise en avant dans
   la signature pour qu'on ne puisse plus l'oublier en passant. */
export function EnTetePage({ titre, description, actions, media, avant, compact }: EnTetePageProps) {
  return (
    <header style={{ marginBottom: compact ? 12 : 20 }}>
      {avant && <div style={{ marginBottom: compact ? 8 : 12 }}>{avant}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: compact ? 12 : 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 15, minWidth: 0 }}>
          {media}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: compact ? 20 : 26, color: '#fff', margin: 0, lineHeight: 1.2 }}>{titre}</h1>
            {description && (
              <p style={{ margin: compact ? '4px 0 0' : '7px 0 0', fontSize: compact ? 12 : 13, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 640 }}>
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </header>
  )
}

/* Bouton de retour des pages de détail (dossier étudiant, fiche professeur). */
export function BoutonRetour({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12.5,
        fontWeight: 700,
        color: 'var(--muted)',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <span aria-hidden>&#8592;</span>
      {label}
    </button>
  )
}
