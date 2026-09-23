import { useSatisfactionProfesseur } from '../../hooks/useSatisfactionProfesseur'
import { Section } from '../ui/Section'
import { EtatChargement } from '../ui/Etats'

/* Une couleur par niveau de note, du plus favorable au moins favorable. Reprend le vocabulaire
   chromatique déjà en place dans l'application (teal = bon, or = à surveiller, danger = alerte)
   plutôt qu'un dégradé arbitraire : la couleur doit vouloir dire la même chose partout. */
const NIVEAUX = [
  { etoiles: 5, libelle: '5 étoiles · très satisfait', couleur: 'var(--accent-teal)' },
  { etoiles: 4, libelle: '4 étoiles · satisfait', couleur: 'var(--accent-blue)' },
  { etoiles: 3, libelle: '3 étoiles · mitigé', couleur: 'var(--accent-gold, #e9cf94)' },
  { etoiles: 2, libelle: '2 étoiles · insatisfait', couleur: 'var(--accent-violet)' },
  { etoiles: 1, libelle: '1 étoile · très insatisfait', couleur: 'var(--danger)' },
]

const RAYON = 54
const EPAISSEUR = 16
const CIRCONFERENCE = 2 * Math.PI * RAYON

/* Disque de répartition des avis (demande client du 2026-09-23, point 5 : « sous la forme d'un
   disque avec les codes couleurs différents »). Tracé en SVG à la main plutôt qu'avec une
   librairie de graphes : le projet n'a aucune dépendance de ce type, et un anneau se résume à
   des arcs posés bout à bout via `stroke-dasharray`. */
function Disque({ segments, total }: { segments: { valeur: number; couleur: string }[]; total: number }) {
  let offsetCumule = 0
  return (
    <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={`Répartition de ${total} avis`}>
      <circle cx={70} cy={70} r={RAYON} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={EPAISSEUR} />
      {segments.map((segment, index) => {
        if (segment.valeur === 0) return null
        const longueur = (segment.valeur / total) * CIRCONFERENCE
        const arc = (
          <circle
            key={index}
            cx={70}
            cy={70}
            r={RAYON}
            fill="none"
            stroke={segment.couleur}
            strokeWidth={EPAISSEUR}
            strokeDasharray={`${longueur} ${CIRCONFERENCE - longueur}`}
            strokeDashoffset={-offsetCumule}
            // Démarrage à midi plutôt qu'à 3 h, sens horaire : c'est ainsi qu'on lit un camembert.
            transform="rotate(-90 70 70)"
          />
        )
        offsetCumule += longueur
        return arc
      })}
    </svg>
  )
}

/* KPI de satisfaction d'un professeur, alimenté par les enquêtes de fin de séance (0068) — il
   se met donc à jour tout seul à chaque avis déposé. Affiché dans l'espace du professeur et
   dans sa fiche côté admin, à l'identique. */
export function KpiSatisfaction({ teacherId, compact }: { teacherId: string | undefined; compact?: boolean }) {
  const { satisfaction, loading } = useSatisfactionProfesseur(teacherId)

  const segments = NIVEAUX.map((niveau) => ({
    valeur: satisfaction.repartition[niveau.etoiles - 1],
    couleur: niveau.couleur,
  }))

  return (
    <Section
      compact={compact}
      titre="Satisfaction des élèves"
      description="Moyenne des enquêtes remplies par les élèves à la fin de chaque séance. Mise à jour automatique."
      compteur={satisfaction.total}
    >
      {loading ? (
        <EtatChargement lignes={1} hauteur={140} />
      ) : satisfaction.total === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0, lineHeight: 1.55 }}>
          Aucun avis pour le moment. L’indicateur se remplira dès que les élèves auront répondu à l’enquête proposée à
          la fin de leurs séances clôturées.
        </p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Disque segments={segments} total={satisfaction.total} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <span className="brand-font" style={{ fontSize: 24, lineHeight: 1, color: 'var(--accent-teal)' }}>
                {satisfaction.tauxSatisfaction}%
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>satisfaits</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexGrow: 1, minWidth: 190 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 3 }}>
              Note moyenne{' '}
              <strong style={{ color: 'var(--accent-gold, #e9cf94)' }}>
                {satisfaction.moyenne === null ? '—' : `${satisfaction.moyenne.toFixed(1)}/5`}
              </strong>{' '}
              sur {satisfaction.total} avis
            </span>
            {NIVEAUX.map((niveau) => {
              const nombre = satisfaction.repartition[niveau.etoiles - 1]
              return (
                <span key={niveau.etoiles} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--muted)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: niveau.couleur, flexShrink: 0 }} />
                  <span style={{ flexGrow: 1 }}>{niveau.libelle}</span>
                  <strong style={{ color: 'var(--ink-2)' }}>{nombre}</strong>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </Section>
  )
}
