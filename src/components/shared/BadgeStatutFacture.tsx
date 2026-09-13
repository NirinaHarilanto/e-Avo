import type { StatutFacture } from '../../types/database.types'

const STYLES: Record<StatutFacture, { label: string; color: string; bg: string; border: string }> = {
  emise: { label: 'Émise', color: 'var(--accent-cyan)', bg: 'rgba(94,179,255,.12)', border: 'rgba(94,179,255,.3)' },
  envoyee: { label: 'Envoyée', color: 'var(--accent-blue)', bg: 'rgba(94,179,255,.12)', border: 'rgba(94,179,255,.3)' },
  payee: { label: 'Payée', color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.3)' },
  en_retard: { label: 'En retard', color: 'var(--danger)', bg: 'rgba(255,138,112,.12)', border: 'rgba(255,138,112,.3)' },
  annulee: { label: 'Annulée', color: 'var(--muted)', bg: 'rgba(255,255,255,.05)', border: 'var(--border)' },
}

export function BadgeStatutFacture({ statut }: { statut: StatutFacture }) {
  const style = STYLES[statut]
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: style.color, background: style.bg, border: `1px solid ${style.border}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
      {style.label}
    </span>
  )
}
