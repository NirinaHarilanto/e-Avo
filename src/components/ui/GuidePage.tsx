import { useState, type ReactNode } from 'react'
import { Icone } from './Icones'

interface GuidePageProps {
  id: string
  titre?: string
  etapes: ReactNode[]
  /* Marge inférieure réduite pour le pôle Pédagogie de l'espace admin. */
  compact?: boolean
}

const PREFIXE_STOCKAGE = 'hoc:guide:'

/* localStorage lève dès que le navigateur bloque le stockage de site (navigation privée,
   cookies tiers coupés), et l'app perdrait alors sa page entière pour un simple encart d'aide.
   Les deux accès sont donc gardés, avec repli sur « guide replié » — décision du client
   (2026-09-14) : les instructions doivent rester pliées par défaut sur toutes les pages, pas
   seulement se replier après un premier passage, pour que chaque écran tienne dans une seule
   vue sans avoir à faire défiler. */
function lireEtatReplie(id: string): boolean {
  try {
    return localStorage.getItem(PREFIXE_STOCKAGE + id) !== 'ouvert'
  } catch {
    return true
  }
}

function ecrireEtatReplie(id: string, replie: boolean) {
  try {
    localStorage.setItem(PREFIXE_STOCKAGE + id, replie ? 'replie' : 'ouvert')
  } catch {
    /* stockage indisponible : l'encart reste simplement ouvert au prochain chargement */
  }
}

/* Encart « Comment utiliser cette page », replié par défaut, dépliable manuellement. Le choix
   est propre à chaque page (`id`) : déplier le guide des paiements ne déplie pas celui des
   contrats, et réciproquement pour un repli. */
export function GuidePage({ id, titre = 'Comment utiliser cette page', etapes, compact }: GuidePageProps) {
  const [replie, setReplie] = useState(() => lireEtatReplie(id))

  function basculer() {
    setReplie((precedent) => {
      ecrireEtatReplie(id, !precedent)
      return !precedent
    })
  }

  return (
    <section
      style={{
        marginBottom: compact ? 12 : 20,
        borderRadius: 16,
        border: '1px solid rgba(94,179,255,.24)',
        background: 'linear-gradient(150deg, rgba(94,179,255,.09), rgba(94,179,255,.03))',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: replie ? (compact ? '8px 14px' : '11px 16px') : '13px 16px 10px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 12.5, fontWeight: 700, color: 'var(--accent-cyan)' }}>
          <Icone nom="info" taille={16} />
          {titre}
        </span>
        <button
          onClick={basculer}
          aria-expanded={!replie}
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: 'var(--muted)',
            background: 'transparent',
            border: '1px solid var(--border-soft)',
            borderRadius: 999,
            padding: '5px 12px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {replie ? 'Afficher' : 'Masquer'}
        </button>
      </div>

      {!replie && (
        <ol style={{ margin: 0, padding: '0 18px 16px 16px', display: 'flex', flexDirection: 'column', gap: 9, listStyle: 'none', counterReset: 'etape' }}>
          {etapes.map((etape, index) => (
            <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
              <span
                style={{
                  width: 21,
                  height: 21,
                  borderRadius: 999,
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#1b1510',
                  background: 'var(--accent-gradient)',
                }}
              >
                {index + 1}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, minWidth: 0 }}>{etape}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
