import { useState, type CSSProperties } from 'react'
import { useSeancesClasse } from '../../hooks/useSeancesClasse'
import { PlanifierSeancesForfait } from '../etudiants/PlanifierSeancesForfait'
import { CarteSeance } from './CarteSeance'
import { boutonSecondaireStyle } from '../ui/Boutons'
import { EtatChargement } from '../ui/Etats'
import { ListeRepliable } from '../ui/Repliable'
import { Modale } from '../ui/Modale'
import { formaterMinutes } from '../../lib/heures'
import type { Database } from '../../types/database.types'

type Session = Database['public']['Tables']['sessions']['Row']

/* Mêmes couleurs et même libellé que la colonne « Présence » du parcours pédagogique
   (DossierEtudiantVue.tsx) — repris à l'identique sur demande du client, à ceci près qu'une ligne
   de planning décrit la séance pour TOUTE la classe : c'est son statut qui s'affiche, jamais la
   présence d'un élève en particulier. */
function StatutSeanceClasse({ statut }: { statut: Session['statut'] }) {
  if (statut === 'planifiee') return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)' }}>Planifiée</span>
  if (statut === 'annulee') return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>Annulée</span>
  if (statut === 'reportee') return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning, #e0a94d)' }}>Reportée</span>
  return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-teal)' }}>Terminée</span>
}

const enTeteColonne: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--muted-2)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

/* Planning d'une classe (ou d'une vague entière) : le planning DÉJÀ POSÉ, en lecture, et le
   formulaire pour en planifier de nouveaux créneaux — demande client du 2026-10-12, aussi bien
   côté professeur (CoursCollectifsProfesseur.tsx, affiché en accordéon inline) que côté admin
   (CohortesAdmin.tsx, affiché dans une pop-up). Le tableau reprend trait pour trait celui du
   parcours pédagogique d'un élève (DossierEtudiantVue.tsx), sur demande expresse du client.
   Chaque ligne ouvre `CarteSeance` — le MÊME composant que l'agenda du professeur : clôturer une
   séance dont la date est passée, la reprogrammer, l'annuler, puis rédiger son compte rendu et
   relire l'enquête de satisfaction, sans qu'aucune de ces règles ne soit dupliquée ici. */
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
  /* Identifiant plutôt qu'un instantané de la séance : après une clôture, le pop-up reste ouvert
     (demande client du 2026-10-12, « proposer le compte rendu avant de fermer le pop-up ») — il
     faut donc que `seanceOuverte` se mette à jour avec la séance rechargée (statut, présence),
     pas qu'elle reste figée sur l'état d'avant clôture. Même pattern que CalendrierProfesseur.tsx. */
  const [seanceOuverteId, setSeanceOuverteId] = useState<string | null>(null)
  const seanceOuverte = seances.find((s) => s.session.id === seanceOuverteId) ?? null
  // Figé au montage : `new Date()` pendant le rendu rendrait celui-ci impur (et relancerait les
  // comparaisons « séance déjà commencée » à chaque re-rendu).
  const [maintenant] = useState(() => new Date().toISOString())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Planning déjà posé</span>
        {loading ? (
          <EtatChargement lignes={3} hauteur={32} />
        ) : seances.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>Aucune séance planifiée pour l'instant.</p>
        ) : (
          <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
            {/* En-têtes purement visuels : chaque ligne reste lisible seule à la lecture d'écran
                (une date, un libellé, une durée, un statut) — même choix que le tableau d'origine. */}
            <div
              aria-hidden
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 18px', background: 'rgba(0,0,0,.18)', borderBottom: '1px solid var(--border-soft)' }}
            >
              <span style={{ ...enTeteColonne, width: 118, flexShrink: 0 }}>Date</span>
              <span style={{ ...enTeteColonne, flexGrow: 1 }}>Séance</span>
              <span style={enTeteColonne}>Durée</span>
              <span style={{ ...enTeteColonne, width: 72, textAlign: 'right' }}>Présence</span>
            </div>
            <ListeRepliable visibles={3} nom="séances">
              {seances.map((s) => (
                <div
                  key={s.session.id}
                  className="row-hl"
                  onClick={peutModifier ? () => setSeanceOuverteId(s.session.id) : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '11px 18px',
                    borderBottom: '1px solid var(--border-soft)',
                    cursor: peutModifier ? 'pointer' : 'default',
                  }}
                >
                  {/* L'heure accompagne la date : une même classe peut avoir plusieurs créneaux
                      dans la semaine (18:00 / 19:00), et c'est précisément elle qu'on vient
                      reprogrammer depuis cet écran. */}
                  <span style={{ fontSize: 12, color: 'var(--muted)', width: 118, flexShrink: 0 }}>
                    {new Date(s.session.debut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    {' · '}
                    {new Date(s.session.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1 }}>
                    {s.session.type === 'individuel' ? 'Séance individuelle' : 'Séance collective'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{formaterMinutes(s.session.duree_minutes)}</span>
                  <span style={{ width: 72, textAlign: 'right' }}>
                    <StatutSeanceClasse statut={s.session.statut} />
                  </span>
                </div>
              ))}
            </ListeRepliable>
          </div>
        )}
        {!loading && seances.length > 0 && peutModifier && (
          <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
            Cliquez une séance pour la clôturer une fois sa date passée, la reprogrammer ou l'annuler.
          </span>
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

      {seanceOuverte && (
        <Modale
          titre={`Séance du ${new Date(seanceOuverte.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}`}
          onFermer={() => setSeanceOuverteId(null)}
          largeurMax={560}
        >
          {/* `onChange` ne ferme plus le pop-up : une clôture doit laisser le temps de renseigner
              le compte rendu qui s'ouvre juste en dessous, pas faire disparaître la fenêtre sous
              les pieds du professeur. Seule la croix (onFermer ci-dessus) la referme désormais. */}
          <CarteSeance
            seance={seanceOuverte}
            maintenant={maintenant}
            sansCadre
            onChange={() => {
              recharger()
              onChange?.()
            }}
          />
        </Modale>
      )}
    </div>
  )
}
