import { useState } from 'react'
import { useSeancesClasse } from '../../hooks/useSeancesClasse'
import { PlanifierSeancesForfait } from '../etudiants/PlanifierSeancesForfait'
import { EditerSeancePlanifieeModale } from './EditerSeancePlanifieeModale'
import { boutonSecondaireStyle } from '../ui/Boutons'
import { EtatChargement } from '../ui/Etats'
import type { Database } from '../../types/database.types'

type Session = Database['public']['Tables']['sessions']['Row']

const LABEL_STATUT: Record<Session['statut'], string> = {
  planifiee: 'Planifiée',
  terminee: 'Terminée',
  annulee: 'Annulée',
  reportee: 'Reportée',
}
const COULEUR_STATUT: Record<Session['statut'], string> = {
  planifiee: 'var(--muted)',
  terminee: 'var(--accent-teal)',
  annulee: 'var(--danger)',
  reportee: 'var(--warning)',
}

/* Planning d'une classe (ou d'une vague entière) : le planning DÉJÀ POSÉ, en lecture, et le
   formulaire pour en planifier de nouveaux créneaux — demande client du 2026-10-12, aussi bien
   côté professeur (CoursCollectifsProfesseur.tsx, affiché en accordéon inline) que côté admin
   (CohortesAdmin.tsx, affiché dans une pop-up). Une séance encore planifiée s'ouvre dans
   `EditerSeancePlanifieeModale` — le MÊME composant que l'agenda, aucune règle dupliquée pour la
   portée « cette séance »/« toute la série » (0123) ni pour la reprogrammation. */
export function PanneauPlanningClasse({
  studentIds,
  cohortId,
  cohortClassId,
  teacherId,
  dateFinParDefaut,
  heuresForfait,
  titre,
  endpoint,
  peutModifier,
  onChange,
}: {
  studentIds: string[]
  cohortId?: string
  cohortClassId?: string
  teacherId?: string
  dateFinParDefaut?: string | null
  heuresForfait?: number | null
  titre?: string
  endpoint?: string
  peutModifier: boolean
  /* Appelé en plus du rechargement interne de ce panneau, pour l'appelant qui a besoin de savoir
     qu'une création/modification a eu lieu (ex. rafraîchir d'autres compteurs à l'écran). */
  onChange?: () => void
}) {
  const { seances, loading, recharger } = useSeancesClasse({ cohortClassId, cohortId })
  const [planificationOuverte, setPlanificationOuverte] = useState(false)
  const [seanceEnEdition, setSeanceEnEdition] = useState<Session | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Planning déjà posé</span>
        {loading ? (
          <EtatChargement lignes={3} hauteur={32} />
        ) : seances.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>Aucune séance planifiée pour l'instant.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {seances.map((s) => {
              const modifiable = peutModifier && s.statut === 'planifiee'
              return (
                <div
                  key={s.id}
                  className={modifiable ? 'row-hl' : undefined}
                  onClick={modifiable ? () => setSeanceEnEdition(s) : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontSize: 12.5,
                    padding: '9px 12px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.03)',
                    cursor: modifiable ? 'pointer' : 'default',
                  }}
                >
                  <span style={{ color: 'var(--ink)' }}>
                    {new Date(s.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} · {s.duree_minutes} min
                  </span>
                  <span style={{ color: COULEUR_STATUT[s.statut], fontSize: 11.5, fontWeight: 700 }}>{LABEL_STATUT[s.statut]}</span>
                </div>
              )
            })}
          </div>
        )}
        {!loading && seances.length > 0 && peutModifier && (
          <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Cliquez une séance encore planifiée pour la reprogrammer ou l'annuler.</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setPlanificationOuverte((v) => !v)}
        style={{ ...boutonSecondaireStyle, alignSelf: 'flex-start' }}
      >
        {planificationOuverte ? 'Masquer la planification' : '+ Planifier de nouveaux créneaux'}
      </button>
      {planificationOuverte && (
        <PlanifierSeancesForfait
          studentIds={studentIds}
          cohortId={cohortId}
          cohortClassId={cohortClassId}
          teacherId={teacherId}
          dateFinParDefaut={dateFinParDefaut}
          heuresForfait={heuresForfait}
          titre={titre ?? 'Planifier de nouveaux créneaux'}
          endpoint={endpoint}
          onCree={() => {
            setPlanificationOuverte(false)
            recharger()
            onChange?.()
          }}
        />
      )}

      {seanceEnEdition && (
        <EditerSeancePlanifieeModale
          session={seanceEnEdition}
          onFermer={() => setSeanceEnEdition(null)}
          onEnregistre={() => {
            setSeanceEnEdition(null)
            recharger()
            onChange?.()
          }}
        />
      )}
    </div>
  )
}
