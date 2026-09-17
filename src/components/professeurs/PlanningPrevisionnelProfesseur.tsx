import { useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import type { Database } from '../../types/database.types'
import type { SeanceProfesseur } from '../../hooks/useCalendrierProfesseur'
import { PlanifierSeancesForfait } from '../etudiants/PlanifierSeancesForfait'
import { EditerSeancePlanifieeModale } from '../shared/EditerSeancePlanifieeModale'
import { GroupeSection } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { boutonSecondaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type Profile = Database['public']['Tables']['profiles']['Row']

interface PlanningPrevisionnelProfesseurProps {
  seances: SeanceProfesseur[]
  etudiantsActifs: Profile[]
  onChange: () => void
}

/* Le planning prévisionnel du professeur : la récurrence hebdomadaire qui crée les séances à
   venir, et la liste de ces séances, chacune reprogrammable.

   Jusqu'ici, seul l'admin pouvait générer un planning en lot (depuis le forfait d'un élève) ; le
   professeur devait créer ses cours un par un. Le formulaire est le même composant que côté
   admin (PlanifierSeancesForfait), pointé sur api/professeur/planifier-seances-prevision, qui
   restreint la planification aux élèves actuellement attribués à l'appelant.

   Modifier une séance déjà planifiée passe par la modale partagée : côté professeur, le
   changement est une PROPOSITION soumise à validation de l'administration (migration 0038),
   règle inchangée ici. */
export function PlanningPrevisionnelProfesseur({ seances, etudiantsActifs, onChange }: PlanningPrevisionnelProfesseurProps) {
  const { profile } = useProfileContext()
  const [eleveId, setEleveId] = useState<string | null>(null)
  const [generateurOuvert, setGenerateurOuvert] = useState(false)
  const [seanceEnEdition, setSeanceEnEdition] = useState<string | null>(null)

  const planifiees = useMemo(
    () =>
      seances
        .filter((s) => s.session.statut === 'planifiee')
        .filter((s) => !eleveId || s.inscriptions.some((i) => i.student_id === eleveId))
        .sort((a, b) => a.session.debut.localeCompare(b.session.debut)),
    [seances, eleveId],
  )

  const seanceOuverte = seances.find((s) => s.session.id === seanceEnEdition) ?? null

  if (etudiantsActifs.length === 0) {
    return (
      <EtatVide
        icone="etudiants"
        titre="Aucun élève attribué"
        description="L’administration doit d’abord vous attribuer un élève : le planning prévisionnel se construit élève par élève."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <GroupeSection
        titre="Élève concerné"
        description="Choisissez l’élève dont vous préparez le planning. Sélectionnez-en plusieurs pour un cours collectif."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={() => setEleveId(null)}
            style={pastilleStyle(eleveId === null)}
          >
            Tous mes élèves
          </button>
          {etudiantsActifs.map((etudiant) => (
            <button key={etudiant.id} type="button" onClick={() => setEleveId(etudiant.id)} style={pastilleStyle(eleveId === etudiant.id)}>
              {etudiant.prenom} {etudiant.nom}
            </button>
          ))}
        </div>
      </GroupeSection>

      <GroupeSection
        titre="Séances prévues"
        description="Chaque ligne est une séance déjà planifiée. Cliquez-la pour proposer un nouvel horaire : l’administration valide le changement."
        actions={
          eleveId ? (
            <button type="button" onClick={() => setGenerateurOuvert((v) => !v)} style={boutonSecondaireStyle}>
              <Icone nom="plus" taille={14} />
              {generateurOuvert ? 'Fermer' : 'Générer une récurrence'}
            </button>
          ) : undefined
        }
      >
        {generateurOuvert && eleveId && (
          <div style={{ marginBottom: 14 }}>
            <PlanifierSeancesForfait
              studentIds={[eleveId]}
              endpoint="/api/professeur/planifier-seances-prevision"
              titre="Générer les séances récurrentes"
              onCree={() => {
                setGenerateurOuvert(false)
                onChange()
              }}
            />
          </div>
        )}

        {planifiees.length === 0 ? (
          <EtatVide
            compact
            icone="seances"
            titre="Aucune séance prévue"
            description={
              eleveId
                ? 'Utilisez « Générer une récurrence » pour créer d’un coup toutes les séances à venir de cet élève.'
                : 'Sélectionnez un élève pour générer son planning, ou planifiez un cours depuis l’agenda.'
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {planifiees.map((seance) => (
              <button
                key={seance.session.id}
                type="button"
                onClick={() => setSeanceEnEdition(seance.session.id)}
                className="carte-ligne row-hl"
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '10px 13px',
                  borderRadius: 10,
                  border: '1px solid var(--border-soft)',
                  background: 'rgba(255,255,255,.03)',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-2)', flexGrow: 1, minWidth: 160 }}>
                  {seance.session.duree_minutes} min ·{' '}
                  {seance.inscriptions.map((i) => `${i.etudiant?.prenom ?? '?'} ${i.etudiant?.nom ?? ''}`).join(', ') || 'aucun élève inscrit'}
                </span>
                {seance.session.changement_statut === 'en_attente' && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', background: 'rgba(255,190,110,.14)', border: '1px solid rgba(255,190,110,.3)', borderRadius: 999, padding: '3px 9px' }}>
                    Changement en attente
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </GroupeSection>

      {seanceOuverte && (
        <EditerSeancePlanifieeModale
          session={seanceOuverte.session}
          etudiants={seanceOuverte.inscriptions.map((i) => i.etudiant).filter((e): e is NonNullable<typeof e> => !!e)}
          professeur={profile}
          video={seanceOuverte.video}
          onFermer={() => setSeanceEnEdition(null)}
          onEnregistre={() => {
            setSeanceEnEdition(null)
            onChange()
          }}
        />
      )}
    </div>
  )
}

function pastilleStyle(actif: boolean) {
  return {
    fontSize: 12.5,
    fontWeight: actif ? 800 : 600,
    color: actif ? '#fff' : 'var(--ink-2)',
    background: actif ? 'var(--accent-blue-gradient)' : 'rgba(0,0,0,.22)',
    border: actif ? 'none' : '1px solid var(--border)',
    borderRadius: 999,
    padding: '9px 15px',
    cursor: 'pointer',
  } as const
}
