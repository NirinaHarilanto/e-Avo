import { LABELS_REGLEMENT, type StatutReglement } from '../../lib/paiements'

const STYLES: Record<StatutReglement, { color: string; bg: string; border: string }> = {
  a_payer: { color: 'var(--accent-cyan)', bg: 'rgba(94,179,255,.12)', border: 'rgba(94,179,255,.3)' },
  partiel: { color: 'var(--accent-gold, #e9cf94)', bg: 'rgba(233,207,148,.14)', border: 'rgba(233,207,148,.32)' },
  paye: { color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.3)' },
  en_retard: { color: 'var(--danger)', bg: 'rgba(255,138,112,.12)', border: 'rgba(255,138,112,.3)' },
  annule: { color: 'var(--muted)', bg: 'rgba(255,255,255,.05)', border: 'var(--border)' },
}

export function BadgeStatutPaiement({ statut }: { statut: StatutReglement }) {
  const style = STYLES[statut]
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: style.color, background: style.bg, border: `1px solid ${style.border}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
      {LABELS_REGLEMENT[statut]}
    </span>
  )
}
