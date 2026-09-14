import type { ReactNode } from 'react'
import { Icone } from './Icones'

/* Squelettes de chargement en remplacement du `<p>Chargement…</p>` gris répété une quinzaine
   de fois dans l'application. L'intérêt n'est pas décoratif : le squelette occupe déjà la place
   du contenu à venir, donc la page ne saute plus au moment où les données arrivent. */
export function EtatChargement({ lignes = 3, hauteur = 64 }: { lignes?: number; hauteur?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="status" aria-label="Chargement en cours">
      {Array.from({ length: lignes }, (_, index) => (
        <div key={index} className="squelette" style={{ height: hauteur, borderRadius: 14 }} />
      ))}
    </div>
  )
}

export function EtatChargementStats({ tuiles = 3 }: { tuiles?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }} role="status" aria-label="Chargement en cours">
      {Array.from({ length: tuiles }, (_, index) => (
        <div key={index} className="squelette" style={{ height: 92, borderRadius: 16 }} />
      ))}
    </div>
  )
}

function Bandeau({ ton, icone, children }: { ton: 'erreur' | 'succes' | 'info'; icone: 'alerte' | 'valide' | 'info'; children: ReactNode }) {
  const couleurs = {
    erreur: { texte: 'var(--danger)', fond: 'rgba(255,138,112,.10)', bord: 'rgba(255,138,112,.34)' },
    succes: { texte: 'var(--success)', fond: 'rgba(111,227,192,.10)', bord: 'rgba(111,227,192,.34)' },
    info: { texte: 'var(--accent-cyan)', fond: 'rgba(94,179,255,.10)', bord: 'rgba(94,179,255,.30)' },
  }[ton]

  return (
    <div
      role={ton === 'erreur' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '11px 14px',
        borderRadius: 12,
        border: `1px solid ${couleurs.bord}`,
        background: couleurs.fond,
        color: couleurs.texte,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <Icone nom={icone} taille={16} style={{ marginTop: 1 }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

export function MessageErreur({ children }: { children: ReactNode }) {
  return (
    <Bandeau ton="erreur" icone="alerte">
      {children}
    </Bandeau>
  )
}

export function MessageSucces({ children }: { children: ReactNode }) {
  return (
    <Bandeau ton="succes" icone="valide">
      {children}
    </Bandeau>
  )
}

export function MessageInfo({ children }: { children: ReactNode }) {
  return (
    <Bandeau ton="info" icone="info">
      {children}
    </Bandeau>
  )
}
