import { CONTEXTE_JALON, LIBELLE_JALON } from '../../lib/jalonsParcours'
import { formaterHeures } from '../../lib/heures'
import { useJalonsParcours } from '../../hooks/useJalonsParcours'
import { Etoiles } from '../etudiants/Etoiles'
import { GroupeSection } from '../ui/Section'

/* Les enquêtes de parcours d'un élève, en lecture — demande client du 2026-10-19 (point 8) :
   « l'admin et le professeur concerné pourront voir l'enquête de satisfaction renseignée par
   l'étudiant ».

   Le même composant sert les deux : c'est la RLS (0130) qui décide de ce qui remonte, pas un
   filtre ici — un professeur ne reçoit que les jalons de ses élèves, et jamais en écriture (il ne
   modifie pas l'avis qu'on porte sur lui).

   Un jalon atteint mais sans réponse figure aussi dans la liste : savoir que l'élève a été
   sollicité et n'a pas répondu est une information, pas un trou à masquer. */
export function EnquetesParcoursAffichage({
  studentId,
  /* `null` plutôt qu'une chaîne vide : supprime l'intitulé de GroupeSection, pas seulement son
     texte — utilisé depuis que cet affichage vit dans son propre onglet « Enquêtes de
     satisfaction » (2026-10-19), où le répéter en sous-titre serait redondant avec l'onglet lui-
     même. Le binôme garde le sien (second bloc du même onglet, à distinguer du premier). */
  titre = 'Enquêtes de satisfaction',
}: {
  studentId: string
  titre?: string | null
}) {
  const { jalons, loading } = useJalonsParcours(studentId)

  if (loading) {
    return (
      <GroupeSection titre={titre}>
        <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>Chargement…</span>
      </GroupeSection>
    )
  }

  return (
    <GroupeSection titre={titre}>
      {jalons.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)' }}>
          Aucune enquête pour l’instant. L’élève en reçoit une à la moitié de ses heures, puis une seconde à trois
          heures de la fin de son forfait.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {jalons.map((jalon) => (
            <div
              key={jalon.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '11px 13px',
                borderRadius: 11,
                border: '1px solid var(--border-soft, var(--border))',
                background: 'var(--surface-alt)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{LIBELLE_JALON[jalon.jalon]}</span>
                {jalon.repondu_le ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Etoiles valeur={jalon.note_globale ?? 0} taille={14} />
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {new Date(jalon.repondu_le).toLocaleDateString('fr-FR')}
                    </span>
                  </span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)' }}>En attente de réponse</span>
                )}
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {CONTEXTE_JALON[jalon.jalon]} {formaterHeures(Number(jalon.heures_consommees_au_declenchement))} sur{' '}
                {formaterHeures(Number(jalon.total_heures_reference))} au moment de l’enquête.
              </span>
              {jalon.note_pedagogie !== null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}>
                  Qualité pédagogique <Etoiles valeur={jalon.note_pedagogie} taille={12} />
                </span>
              )}
              {jalon.commentaire && (
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>
                  « {jalon.commentaire} »
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </GroupeSection>
  )
}
