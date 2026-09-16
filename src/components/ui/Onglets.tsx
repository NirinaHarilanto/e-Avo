export interface Onglet<T extends string> {
  value: T
  label: string
  compteur?: number
}

interface OngletsProps<T extends string> {
  onglets: readonly Onglet<T>[]
  actif: T
  onChange: (value: T) => void
  etiquette?: string
  /* Tient sur une seule ligne (jamais de retour à la ligne) avec un gabarit plus resserré —
     demande client du 2026-09-16 pour les onglets du dossier étudiant, dont le panneau de
     détail est trop étroit pour 4 onglets en taille normale sans qu'ils ne passent à la ligne.
     Les intitulés restent entiers et lisibles, seuls le remplissage et la taille de police
     diminuent. N'affecte que l'appelant qui le demande explicitement : les autres barres
     d'onglets de l'application (Séances, Documents, Paiements…) gardent leur gabarit habituel. */
  compact?: boolean
}

/* Barre d'onglets unique. Le même bloc d'une vingtaine de lignes était recopié dans
   SeancesAdmin, DocumentsAdmin, PaiementsAdmin, FacturationAdmin et ContratsAdmin ; seule
   FacturationAdmin y avait ajouté un `textTransform: capitalize` parce que ses libellés étaient
   les valeurs brutes (`devis`, `factures`) — ici les libellés sont toujours explicites. */
export function Onglets<T extends string>({ onglets, actif, onChange, etiquette = 'Sections', compact = false }: OngletsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={etiquette}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        flexWrap: compact ? 'nowrap' : 'wrap',
        overflowX: compact ? 'auto' : undefined,
      }}
    >
      {onglets.map((onglet) => {
        const estActif = onglet.value === actif
        return (
          <button
            key={onglet.value}
            role="tab"
            aria-selected={estActif}
            onClick={() => onChange(onglet.value)}
            className={`nav-item${estActif ? ' nav-item-active' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: compact ? 5 : 8,
              padding: compact ? '7px 11px' : '9px 16px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              fontSize: compact ? 11.5 : 13,
              fontWeight: estActif ? 800 : 600,
              color: estActif ? '#1b1510' : 'var(--ink-2)',
              background: estActif ? 'var(--accent-gradient)' : 'rgba(255,255,255,.04)',
            }}
          >
            {onglet.label}
            {onglet.compteur !== undefined && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  borderRadius: 999,
                  padding: '1px 7px',
                  background: estActif ? 'rgba(27,21,16,.18)' : 'rgba(255,255,255,.08)',
                  color: estActif ? '#1b1510' : 'var(--muted)',
                }}
              >
                {onglet.compteur}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
