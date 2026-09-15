import { useState } from 'react'
import type { AccentPalette } from '../../lib/accent'
import type { TypeProgrammeProspect } from '../../types/database.types'
import { ReserverAppel } from './ReserverAppel'

const TYPES: { valeur: TypeProgrammeProspect; libelle: string; detail: string }[] = [
  { valeur: 'individuel', libelle: 'Individuel', detail: 'Un professeur rien que pour vous' },
  { valeur: 'duo', libelle: 'Duo', detail: 'À deux, sur un même créneau' },
  { valeur: 'collectif', libelle: 'Collectif', detail: 'En petit groupe, par vague' },
]

/* Un cours collectif ne se cale pas après un appel diagnostic mais après un test de
   positionnement : l'élève rejoint une vague existante, il faut donc situer son niveau par
   rapport au groupe. Le libellé suit ce que vit réellement le visiteur. */
export function libelleAppel(type: TypeProgrammeProspect): string {
  return type === 'collectif' ? 'Appel pour un test de positionnement' : 'Appel diagnostic'
}

/* Fenêtre de réservation, ouverte depuis n'importe quel bouton « Réserver » de la page publique.
   L'agenda ne vit plus dans le corps de la page : il ne s'affiche qu'ici, à la demande, ce qui
   permet à l'écran d'accueil de tenir en une seule vue. */
export function ModaleReservation({
  etablissementSlug,
  etablissementNom,
  accent,
  typeInitial = 'individuel',
  onFermer,
}: {
  etablissementSlug: string
  etablissementNom: string
  accent: AccentPalette
  typeInitial?: TypeProgrammeProspect
  onFermer: () => void
}) {
  const [type, setType] = useState<TypeProgrammeProspect>(typeInitial)

  return (
    <div className="voile-modale" onClick={onFermer}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={libelleAppel(type)}
        className="card fenetre-reservation"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="entete-reservation">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 20, margin: '0 0 4px', color: 'var(--ink)' }}>{libelleAppel(type)}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
              Gratuit et sans engagement, avec {etablissementNom}.
            </p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="fermer-modale">
            ×
          </button>
        </header>

        <div className="choix-type">
          {TYPES.map((option) => {
            const actif = option.valeur === type
            return (
              <button
                key={option.valeur}
                type="button"
                onClick={() => setType(option.valeur)}
                aria-pressed={actif}
                style={{
                  flex: '1 1 150px',
                  textAlign: 'left',
                  padding: '11px 14px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: `1px solid ${actif ? 'transparent' : 'var(--border)'}`,
                  background: actif ? accent.accentGrad : 'var(--surface-alt)',
                  color: actif ? accent.accentInk : 'var(--ink-2)',
                }}
              >
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{option.libelle}</span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.85 }}>{option.detail}</span>
              </button>
            )
          })}
        </div>

        <div className="corps-reservation">
          <ReserverAppel
            etablissementSlug={etablissementSlug}
            etablissementNom={etablissementNom}
            accent={accent}
            typeInitial={type}
            sansCadre
          />
        </div>
      </div>
    </div>
  )
}
