export type StatutSignatureContrat = 'signe' | 'en_attente' | 'aucun'

const STYLES: Record<StatutSignatureContrat, { label: string; color: string; bg: string; border: string }> = {
  signe: { label: 'Contrat signé', color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.3)' },
  en_attente: { label: 'Contrat en attente', color: 'var(--accent-gold, #e9cf94)', bg: 'rgba(233,207,148,.12)', border: 'rgba(233,207,148,.32)' },
  aucun: { label: 'Aucun contrat', color: 'var(--danger)', bg: 'rgba(255,138,112,.10)', border: 'rgba(255,138,112,.28)' },
}

/* Petit indicateur de signature de contrat, affiché dans les listes Professeurs et Étudiants
   de l'espace admin — pour repérer d'un coup d'œil qui n'a pas encore signé avant le début des
   cours, sans avoir à ouvrir chaque fiche. `compact` réduit encore la taille pour tenir dans
   une ligne de liste dense. */
export function BadgeStatutContrat({ statut, compact }: { statut: StatutSignatureContrat; compact?: boolean }) {
  const style = STYLES[statut]
  return (
    <span
      style={{
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        color: style.color,
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 999,
        padding: compact ? '2px 8px' : '4px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  )
}
