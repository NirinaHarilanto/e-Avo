import type { ReactNode } from 'react'

export type TonStat = 'or' | 'bleu' | 'teal' | 'violet' | 'alerte' | 'neutre'

/* Le halo radial derrière le chiffre appartenait au thème sombre ; les tuiles des maquettes du
   2026-10-16 sont des aplats nets. `--halo-stat` le neutralise en bloc dans les espaces, sans
   avoir à retoucher chaque ton, et la vitrine garde le sien. */
const TONS: Record<TonStat, { texte: string; halo: string }> = {
  or: { texte: 'var(--accent-gold, #e9cf94)', halo: 'rgba(233,207,148,.16)' },
  bleu: { texte: 'var(--accent-blue)', halo: 'rgba(169,140,255,.16)' },
  teal: { texte: 'var(--accent-teal)', halo: 'rgba(111,227,192,.16)' },
  violet: { texte: 'var(--accent-violet)', halo: 'rgba(199,156,255,.16)' },
  alerte: { texte: 'var(--danger)', halo: 'rgba(255,138,112,.16)' },
  neutre: { texte: 'var(--ink)', halo: 'rgba(255,255,255,.07)' },
}

export function GrilleStats({ children, min = 190, compact }: { children: ReactNode; min?: number; compact?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: compact ? 10 : 14 }}>
      {children}
    </div>
  )
}

interface StatProps {
  libelle: string
  valeur: ReactNode
  unite?: string
  aide?: ReactNode
  ton?: TonStat
  pied?: ReactNode
  /* Variante resserrée, utilisée dans le pôle Pédagogie de l'espace admin (Prospects,
     Étudiants, Vagues, Professeurs, Séances, Heures) pour que chaque page tienne dans une
     seule vue sans défilement — aucune information n'est retirée, seuls les espacements et les
     tailles de police sont réduits. */
  compact?: boolean
  /* Tuile cliquable — demande client du 2026-10-30 : « quand on clique le bloc, on devrait avoir
     la liste des étudiants inactifs dans un pop-up ». La tuile devient alors un vrai bouton
     (clavier et lecture d'écran compris), sans changer d'apparence : seul le curseur et un léger
     relief au survol disent qu'elle s'ouvre. */
  onClick?: () => void
  /* Ce que le clic va faire, pour l'infobulle et le nom accessible du bouton. */
  titreAction?: string
}

/* Tuile de statistique unique de l'application. Elle remplace la `Tuile` locale de
   DossierEtudiantVue et la paire réécrite en dur dans ProfesseurDetailAdmin, qui avaient déjà
   divergé (tailles 26 vs 28, halo présent d'un côté seulement). */
export function Stat({ libelle, valeur, unite, aide, ton = 'or', pied, compact, onClick, titreAction }: StatProps) {
  const couleurs = TONS[ton]
  const Balise = onClick ? 'button' : 'div'
  return (
    <Balise
      className={onClick ? 'card card-lift' : 'card'}
      {...(onClick ? { type: 'button' as const, onClick, title: titreAction, 'aria-label': titreAction } : {})}
      style={{
        padding: compact ? '13px 15px' : '18px',
        position: 'relative',
        overflow: 'hidden',
        ...(onClick
          ? {
              // `card` pose déjà fond, bordure et rayon : seuls les réglages par défaut du bouton
              // (police héritée, texte à gauche, curseur) restent à rétablir.
              font: 'inherit',
              textAlign: 'left' as const,
              width: '100%',
              cursor: 'pointer',
              /* Colonne explicite, et non `display: block` : les navigateurs CENTRENT
                 verticalement le contenu d'un `<button>`, et la grille étirant toutes les tuiles
                 à la même hauteur, le libellé de celle-ci descendait de quelques pixels — visible
                 dès qu'une tuile voisine porte une ligne d'aide et pas elle. */
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'stretch' as const,
              justifyContent: 'flex-start' as const,
            }
          : {}),
      }}
    >
      {/* Tout l'intérieur est en `<span>` plutôt qu'en `<div>`/`<p>` : une tuile cliquable est un
          `<button>`, dont le contenu ne peut être que du contenu de phrase. Les `display` repris
          au cas par cas gardent exactement la même mise en page qu'avant. */}
      <span
        aria-hidden
        style={{
          display: 'block',
          position: 'absolute',
          top: compact ? -24 : -34,
          right: compact ? -20 : -26,
          width: compact ? 76 : 104,
          height: compact ? 76 : 104,
          borderRadius: '50%',
          background: `radial-gradient(circle, var(--halo-stat, ${couleurs.halo}), transparent 68%)`,
          pointerEvents: 'none',
        }}
      />
      <span style={{ fontSize: compact ? 10.5 : 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>
        {libelle}
      </span>
      <span className="brand-font" style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: compact ? 6 : 10, color: couleurs.texte, fontWeight: 700 }}>
        <span style={{ fontSize: compact ? 20 : 26, lineHeight: 1 }}>{valeur}</span>
        {unite && <span style={{ fontSize: compact ? 12 : 14, opacity: 0.75 }}>{unite}</span>}
      </span>
      {aide && <span style={{ display: 'block', margin: compact ? '6px 0 0' : '10px 0 0', fontSize: compact ? 11 : 12, color: 'var(--muted)', lineHeight: 1.4 }}>{aide}</span>}
      {pied && <span style={{ display: 'block', marginTop: compact ? 7 : 10, paddingTop: compact ? 6 : 9, borderTop: '1px solid var(--border-soft)' }}>{pied}</span>}
    </Balise>
  )
}
