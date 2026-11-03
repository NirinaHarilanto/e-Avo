import { Modale } from '../ui/Modale'
import { MessageAvertissement } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { etiquetteStyle } from '../ui/Champ'

/* Récapitulatif obligatoire avant de planifier une SÉRIE de séances — demande client du
   2026-11-03 : « quand on appuie sur Planifier la séance, il faut afficher un pop-up de
   validation et récapitulatif des séances qui vont être planifiées (nombre de séances et dates
   et heures de séances, étudiants et professeur associés). Une fois validé, les séances seront
   réellement planifiées. Ce mécanisme […] est à appliquer juste avant chaque validation de
   séance pour les séances de cours en séries (plus de deux séances à prendre d'un coup). »

   Ce qui l'a motivé : le 2026-11-03, « Tous les jours » sans date de fin a créé 156 séances d'un
   coup pour une seule élève, et la même réservation relancée quatre fois a laissé 107 séances
   fantômes à nettoyer à la main. Le seul chiffre affiché avant validation était une ligne de
   texte sous le sélecteur, facile à ne pas lire. Ici, rien ne part sans que les dates aient été
   vues une par une. */
export function RecapitulatifSeances({
  dates,
  dureeMinutes,
  professeurs,
  etudiants,
  enCours,
  onAnnuler,
  onConfirmer,
}: {
  /* Dates de début de chaque séance, déjà résolues — ce composant n'en calcule aucune. */
  dates: Date[]
  dureeMinutes: number
  professeurs: string[]
  etudiants: string[]
  enCours: boolean
  onAnnuler: () => void
  onConfirmer: () => void
}) {
  const formatDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const formatHeure = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  const totalHeures = (dates.length * dureeMinutes) / 60

  return (
    <Modale titre="Confirmer les séances à planifier" onFermer={onAnnuler} largeurMax={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)',
          }}
        >
          <strong style={{ fontSize: 26, color: 'var(--accent-blue)' }}>{dates.length}</strong>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            séance{dates.length > 1 ? 's' : ''} de {dureeMinutes} min — {totalHeures.toLocaleString('fr-FR')} h au total
          </span>
        </div>

        {/* Au-delà d'une trentaine, le nombre lui-même devient l'information importante : c'est
            exactement le seuil où personne ne relit la liste, et où l'erreur passe. */}
        {dates.length > 30 && (
          <MessageAvertissement>
            Cela fait beaucoup de séances d’un coup. Vérifiez la date de fin de la répétition avant de confirmer.
          </MessageAvertissement>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={etiquetteStyle}>Professeur{professeurs.length > 1 ? 's' : ''}</span>
          <span style={{ fontSize: 13, color: 'var(--ink)' }}>
            {professeurs.length > 0 ? professeurs.join(', ') : 'Aucun professeur associé'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={etiquetteStyle}>Étudiant{etudiants.length > 1 ? 's' : ''}</span>
          <span style={{ fontSize: 13, color: 'var(--ink)' }}>
            {etudiants.length > 0 ? etudiants.join(', ') : 'Aucun étudiant associé'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={etiquetteStyle}>Dates et heures</span>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 240,
              overflowY: 'auto',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface-alt)',
            }}
          >
            {dates.map((d, index) => (
              <div
                key={d.toISOString()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 12px',
                  borderTop: index === 0 ? 'none' : '1px solid var(--border-soft)',
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: 'var(--muted-2)', width: 26, flexShrink: 0 }}>{index + 1}</span>
                <span style={{ color: 'var(--ink-2)', flexGrow: 1, textTransform: 'capitalize' }}>{formatDate(d)}</span>
                <strong style={{ color: 'var(--ink)' }}>{formatHeure(d)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onAnnuler} disabled={enCours} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
            Modifier
          </button>
          <button
            onClick={onConfirmer}
            disabled={enCours || dates.length === 0}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || dates.length === 0 ? 0.6 : 1 }}
          >
            {enCours ? 'Planification…' : `Confirmer ${dates.length} séance${dates.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Modale>
  )
}

/* Seuil commun à tous les écrans qui créent des séances : au-delà de deux, on passe par le
   récapitulatif. « Plus de deux séances à prendre d'un coup », dans les mots du client. */
export const SEUIL_RECAPITULATIF = 2
