import { useVagueEtudiant } from '../../hooks/useVagueEtudiant'
import { formaterMinutes } from '../../lib/heures'
import { Section } from '../ui/Section'
import { EtatChargement } from '../ui/Etats'
import { BadgeStatutSeance } from '../shared/BadgeStatutSeance'

/* Planning de la vague, visible par chacun de ses élèves (0069, demande client du 2026-09-23).
   Rien à afficher pour un élève en individuel ou en duo : le composant se retire de lui-même
   plutôt que de laisser un bloc vide dans le dossier. */
export function PlanningVagueEtudiant({ studentId }: { studentId: string }) {
  const { vague, loading } = useVagueEtudiant(studentId)

  if (loading) return <EtatChargement lignes={2} hauteur={60} />
  if (!vague) return null

  const maintenant = new Date().toISOString()
  const aVenir = vague.seances.filter((s) => s.debut >= maintenant && s.statut === 'planifiee')
  const passees = vague.seances.filter((s) => s.debut < maintenant || s.statut !== 'planifiee')

  return (
    <Section
      titre={`Ma vague · ${vague.cohorte.nom}`}
      description={
        vague.professeur
          ? `Animée par ${vague.professeur.prenom} ${vague.professeur.nom}. Le planning ci-dessous est celui de tout le groupe.`
          : 'Le planning ci-dessous est celui de tout le groupe.'
      }
      compteur={vague.seances.length}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)' }}>
          <span>
            Du {new Date(vague.cohorte.date_debut).toLocaleDateString('fr-FR')} au{' '}
            {new Date(vague.cohorte.date_fin).toLocaleDateString('fr-FR')}
          </span>
          <span>
            {vague.camarades.length + 1} élève{vague.camarades.length > 0 ? 's' : ''} dans la vague
          </span>
        </div>

        {vague.seances.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0, lineHeight: 1.55 }}>
            Le planning de votre vague n’est pas encore établi. Il apparaîtra ici dès que votre professeur ou
            l’administration l’aura programmé.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[...aVenir, ...passees].map((seance) => {
              const debut = new Date(seance.debut)
              const estPassee = seance.debut < maintenant || seance.statut !== 'planifiee'
              return (
                <div
                  key={seance.id}
                  className="row-hl"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '8px 6px',
                    borderBottom: '1px solid var(--border-soft)',
                    opacity: estPassee ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: 12.5, color: 'var(--ink)', flexGrow: 1, minWidth: 190 }}>
                    {debut.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                    {debut.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{formaterMinutes(seance.duree_minutes)}</span>
                  <BadgeStatutSeance statut={seance.statut} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Section>
  )
}
