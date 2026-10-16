import type { ReactNode } from 'react'
import { NotificationsBell } from '../shared/NotificationsBell'
import { BoutonRafraichir } from '../shared/BoutonRafraichir'

interface EnTetePageProps {
  titre: ReactNode
  actions?: ReactNode
  media?: ReactNode
  avant?: ReactNode
  /* Variante resserrée pour le pôle Pédagogie de l'espace admin, dont les pages doivent tenir
     dans une seule vue. */
  compact?: boolean
}

/* En-tête unique des pages des trois espaces connectés. Il en existait trois variantes
   divergentes (flex/center + marge 18, flex/flex-end + marge 22, `<h1>` nu).

   Refonte du 2026-10-16 (maquettes client) :
   — `description` retirée. Ces phrases étaient des instructions d'usage (« Cliquez sur un cours
     pour voir son professeur… », « faites glisser une carte vers la colonne suivante… ») et le
     client a demandé de les enlever en début de chaque section. Aucune maquette n'en montre.
   — « Actualiser » et la cloche de notifications sont rendus ici, à droite du titre, parce que la
     barre supérieure qui les portait a disparu (voir EspaceLayout.tsx). Ils sont posés par ce
     composant et non par chaque page : les quarante écrans des trois espaces passent tous par
     cet en-tête, donc aucun ne peut les perdre en route. Ils précèdent `actions`, comme sur les
     maquettes, où le bouton principal de la page est le plus à droite. */
export function EnTetePage({ titre, actions, media, avant, compact }: EnTetePageProps) {
  return (
    <header style={{ marginBottom: compact ? 14 : 24 }}>
      {avant && <div style={{ marginBottom: compact ? 8 : 12 }}>{avant}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: compact ? 12 : 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 14, minWidth: 0 }}>
          {media}
          <h1 style={{ fontSize: compact ? 22 : 28, fontWeight: 700, color: 'var(--ink)', margin: 0, lineHeight: 1.2, minWidth: 0 }}>
            {titre}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <BoutonRafraichir />
          <NotificationsBell />
          {actions}
        </div>
      </div>
    </header>
  )
}

/* Bouton de retour des pages de détail (dossier étudiant, fiche professeur). */
export function BoutonRetour({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12.5,
        fontWeight: 700,
        color: 'var(--muted)',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <span aria-hidden>&#8592;</span>
      {label}
    </button>
  )
}
