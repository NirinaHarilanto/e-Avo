import type { ReactNode } from 'react'

export type TonStat = 'or' | 'bleu' | 'teal' | 'violet' | 'alerte' | 'neutre'

const TONS: Record<TonStat, { texte: string; halo: string }> = {
  or: { texte: 'var(--accent-gold, #e9cf94)', halo: 'rgba(233,207,148,.16)' },
  bleu: { texte: 'var(--accent-blue)', halo: 'rgba(94,179,255,.16)' },
  teal: { texte: 'var(--accent-teal)', halo: 'rgba(111,227,192,.16)' },
  violet: { texte: 'var(--accent-violet)', halo: 'rgba(199,156,255,.16)' },
  alerte: { texte: 'var(--danger)', halo: 'rgba(255,138,112,.16)' },
  neutre: { texte: 'var(--ink)', halo: 'rgba(255,255,255,.07)' },
}

export function GrilleStats({ children, min = 190 }: { children: ReactNode; min?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14 }}>
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
}

/* Tuile de statistique unique de l'application. Elle remplace la `Tuile` locale de
   DossierEtudiantVue et la paire réécrite en dur dans ProfesseurDetailAdmin, qui avaient déjà
   divergé (tailles 26 vs 28, halo présent d'un côté seulement). */
export function Stat({ libelle, valeur, unite, aide, ton = 'or', pied }: StatProps) {
  const couleurs = TONS[ton]
  return (
    <div className="card" style={{ padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -34,
          right: -26,
          width: 104,
          height: 104,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${couleurs.halo}, transparent 68%)`,
          pointerEvents: 'none',
        }}
      />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {libelle}
      </span>
      <div className="brand-font" style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 8, color: couleurs.texte }}>
        <span style={{ fontSize: 27, lineHeight: 1.1 }}>{valeur}</span>
        {unite && <span style={{ fontSize: 14, opacity: 0.75 }}>{unite}</span>}
      </div>
      {aide && <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>{aide}</p>}
      {pied && <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border-soft)' }}>{pied}</div>}
    </div>
  )
}
