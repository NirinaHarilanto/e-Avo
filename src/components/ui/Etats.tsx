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

function Bandeau({
  ton,
  icone,
  children,
}: {
  ton: 'erreur' | 'succes' | 'info' | 'avertissement'
  icone: 'alerte' | 'valide' | 'info'
  children: ReactNode
}) {
  /* Les fonds et bordures passent par des variables à valeur de repli : le thème clair des espaces
     les redéfinit en aplats pastel pleins et sans bordure, comme le bandeau « À compléter » des
     maquettes du 2026-10-16 ; le repli garde les voiles translucides du thème sombre, que portent
     encore la vitrine et la page de connexion. */
  const couleurs = {
    erreur: {
      texte: 'var(--texte-bandeau-erreur, var(--danger))',
      fond: 'var(--fond-bandeau-erreur, rgba(255,138,112,.10))',
      bord: 'var(--bord-bandeau-erreur, rgba(255,138,112,.34))',
    },
    succes: {
      texte: 'var(--texte-bandeau-succes, var(--success))',
      fond: 'var(--fond-bandeau-succes, rgba(111,227,192,.10))',
      bord: 'var(--bord-bandeau-succes, rgba(111,227,192,.34))',
    },
    info: {
      texte: 'var(--texte-bandeau-info, var(--accent-cyan))',
      fond: 'var(--fond-bandeau-info, rgba(169,140,255,.10))',
      bord: 'var(--bord-bandeau-info, rgba(169,140,255,.30))',
    },
    // Distinct de « erreur » (rouge, bloquant) : un avertissement signale, sans empêcher d'agir —
    // demande client du 2026-10-10, « mets l'information [...] sous forme de warning » pour une
    // information jusqu'ici en simple texte gris, qui se perdait à côté du reste.
    avertissement: {
      texte: 'var(--texte-bandeau-avertissement, var(--warning))',
      fond: 'var(--fond-bandeau-avertissement, rgba(233,207,148,.12))',
      bord: 'var(--bord-bandeau-avertissement, rgba(233,207,148,.34))',
    },
  }[ton]

  return (
    <div
      role={ton === 'erreur' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        borderRadius: 16,
        border: `1px solid ${couleurs.bord}`,
        background: couleurs.fond,
        color: couleurs.texte,
        fontSize: 14,
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

export function MessageAvertissement({ children }: { children: ReactNode }) {
  return (
    <Bandeau ton="avertissement" icone="alerte">
      {children}
    </Bandeau>
  )
}
