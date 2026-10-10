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
  /* Gabarit plus resserré (remplissage et taille de police réduits) — demande client du
     2026-09-16 pour les onglets du dossier étudiant. N'affecte QUE la taille : par défaut, des
     onglets trop nombreux pour la largeur disponible passent simplement à la ligne, comme pour
     le gabarit normal. N'affecte que l'appelant qui le demande explicitement : les autres barres
     d'onglets de l'application (Séances, Documents, Paiements…) gardent leur gabarit habituel. */
  compact?: boolean
  /* Interdit le retour à la ligne et ouvre un défilement horizontal à la place — demande client
     du 2026-09-16, pour le dossier étudiant UNIQUEMENT : son panneau de détail est trop étroit
     pour que 4 onglets passent à la ligne proprement (le contenu en dessous resterait aligné sur
     une grille à deux colonnes, perturbée par une hauteur d'en-tête qui varierait selon le nombre
     de lignes d'onglets).
     À LAISSER ABSENT PARTOUT AILLEURS : avec seulement deux ou trois libellés courts (Messages,
     Cours collectifs…), le navigateur affiche quand même sa barre de défilement native dès que le
     contenu dépasse le conteneur ne serait-ce que d'un pixel — un défaut visuel réel, signalé par
     le client le 2026-10-10 sur les onglets Reçus/Envoyés, alors qu'aucun défilement n'était
     seulement nécessaire. Le retour à la ligne, lui, ne s'affiche jamais pour deux ou trois
     libellés courts à une largeur d'écran raisonnable — aucune régression visuelle possible. */
  defilant?: boolean
}

/* Barre d'onglets unique. Le même bloc d'une vingtaine de lignes était recopié dans
   SeancesAdmin, DocumentsAdmin, PaiementsAdmin, FacturationAdmin et ContratsAdmin ; seule
   FacturationAdmin y avait ajouté un `textTransform: capitalize` parce que ses libellés étaient
   les valeurs brutes (`devis`, `factures`) — ici les libellés sont toujours explicites. */
export function Onglets<T extends string>({ onglets, actif, onChange, etiquette = 'Sections', compact = false, defilant = false }: OngletsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={etiquette}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        flexWrap: defilant ? 'nowrap' : 'wrap',
        overflowX: defilant ? 'auto' : undefined,
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
