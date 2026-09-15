import type { ReactNode } from 'react'
import { Logo } from '../shared/Logo'

/* Coquille commune aux deux pages légales publiques (confidentialité, conditions). Volontairement
   hors des layouts d'espace (EspaceLayout/PlateformeLayout) : ces pages doivent rester lisibles
   sans être connecté, y compris pour le robot de vérification de Google. */
export function PageLegale({ titre, misAJour, children }: { titre: string; misAJour: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <header style={{ padding: '22px 40px', borderBottom: '1px solid var(--border-soft)' }}>
        <a href="/" style={{ display: 'inline-flex' }}>
          <Logo taille={32} />
        </a>
      </header>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 className="brand-font" style={{ fontSize: 30, color: '#fff', margin: '0 0 6px' }}>
          {titre}
        </h1>
        <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: '0 0 34px' }}>Dernière mise à jour : {misAJour}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, fontSize: 14, lineHeight: 1.75, color: 'var(--ink-2)' }}>
          {children}
        </div>
        <a href="/" className="btn-shine" style={{ marginTop: 40, display: 'inline-flex', background: 'var(--accent-blue-gradient)', color: '#fff' }}>
          Retour à l'accueil
        </a>
      </main>
    </div>
  )
}

export function BlocLegal({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="brand-font" style={{ fontSize: 18, color: 'var(--accent-gold, #e9cf94)', margin: '0 0 8px' }}>
        {titre}
      </h2>
      {children}
    </section>
  )
}
