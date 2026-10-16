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
  /* Les maquettes du 2026-10-16 emploient deux dessins selon ce que la barre commande : des
     libellés soulignés quand elle change de SECTION (onglets du dossier étudiant), des pastilles
     arrondies quand elle FILTRE une liste sans la quitter (catégories de « Mes documents »). Le
     défaut reste les onglets, qui couvrent la majorité des usages. */
  variante?: 'onglets' | 'pastilles'
}

/* Barre d'onglets unique. Le même bloc d'une vingtaine de lignes était recopié dans
   SeancesAdmin, DocumentsAdmin, PaiementsAdmin, FacturationAdmin et ContratsAdmin ; seule
   FacturationAdmin y avait ajouté un `textTransform: capitalize` parce que ses libellés étaient
   les valeurs brutes (`devis`, `factures`) — ici les libellés sont toujours explicites.

   Refonte du 2026-10-16 : la maquette de la fiche étudiant dessine ces onglets en libellés
   soulignés sur un filet continu, et non plus en pilules pleines. Ils n'empruntent donc plus
   `.nav-item` à la barre latérale (dont ils héritaient du fond et du survol) : cette classe est
   désormais propre au menu, et le survol d'un onglet vit dans `.onglet-page` (index.css). */
export function Onglets<T extends string>({
  onglets,
  actif,
  onChange,
  etiquette = 'Sections',
  compact = false,
  defilant = false,
  variante = 'onglets',
}: OngletsProps<T>) {
  const pastilles = variante === 'pastilles'
  return (
    <div
      role="tablist"
      aria-label={etiquette}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: pastilles ? 8 : compact ? 16 : 24,
        flexWrap: defilant ? 'nowrap' : 'wrap',
        overflowX: defilant ? 'auto' : undefined,
        borderBottom: pastilles ? undefined : '1px solid var(--border)',
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
            className={`onglet-page${estActif ? ' onglet-page-actif' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: compact ? 6 : 8,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              fontSize: compact ? 12.5 : pastilles ? 13 : 14,
              fontWeight: estActif ? 700 : 600,
              ...(pastilles
                ? {
                    height: compact ? 30 : 34,
                    padding: compact ? '0 12px' : '0 14px',
                    borderRadius: 999,
                    border: estActif ? 'none' : '1px solid var(--border)',
                    background: estActif ? 'var(--accent-blue)' : 'var(--surface)',
                    color: estActif ? '#fefffa' : 'var(--accent-blue)',
                  }
                : {
                    padding: compact ? '0 0 9px' : '0 0 12px',
                    border: 'none',
                    /* Le soulignement de l'onglet actif doit recouvrir le filet du conteneur, pas
                       se poser au-dessus : d'où ce pixel de débord vers le bas. */
                    borderBottom: estActif ? '2.5px solid var(--hoc-repere-or, #d9a83b)' : 'none',
                    marginBottom: estActif ? -1 : 0,
                    background: 'transparent',
                    color: estActif ? 'var(--ink)' : 'var(--muted)',
                  }),
            }}
          >
            {onglet.label}
            {onglet.compteur !== undefined && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 999,
                  padding: '2px 8px',
                  background: estActif && pastilles ? 'rgba(254,255,250,.22)' : 'var(--hoc-pastille, rgba(255,255,255,.08))',
                  color: estActif && pastilles ? '#fefffa' : 'var(--accent-blue)',
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
