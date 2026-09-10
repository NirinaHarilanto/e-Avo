import type { ReactNode } from 'react'

interface OverlayImpressionProps {
  onFermer: () => void
  children: ReactNode
}

/* Chrome partagé des 3 vues imprimables (devis/facture/contrat) : overlay plein écran +
   bouton Imprimer (window.print()) + zone .zone-imprimable (voir la règle @media print dans
   index.css, qui n'imprime que cette zone quelle que soit sa profondeur dans le DOM). */
export function OverlayImpression({ onFermer, children }: OverlayImpressionProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 200, overflowY: 'auto', padding: '30px 20px' }}>
      <div className="barre-actions-impression" style={{ maxWidth: 700, margin: '0 auto 14px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          onClick={onFermer}
          style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'transparent', border: '1px solid rgba(255,255,255,.3)', borderRadius: 999, padding: '8px 16px', cursor: 'pointer' }}
        >
          Fermer
        </button>
        <button onClick={() => window.print()} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
          Imprimer
        </button>
      </div>
      <div className="zone-imprimable" style={{ maxWidth: 700, margin: '0 auto', background: '#fff', color: '#111', padding: 40, borderRadius: 8 }}>
        {children}
      </div>
    </div>
  )
}
