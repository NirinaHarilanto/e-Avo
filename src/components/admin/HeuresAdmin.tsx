import { AdminLayout } from '../layout/AdminLayout'
import { useHeuresAdmin, type LigneHeures } from '../../hooks/useHeuresAdmin'
import { initiales } from '../etudiants/DossierEtudiantVue'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, EtatChargementStats } from '../ui/Etats'

export function HeuresAdmin() {
  const { etudiants, professeurs, loading } = useHeuresAdmin()

  const totalConsommees = etudiants.reduce((total, l) => total + l.heures, 0)
  const totalEnseignees = professeurs.reduce((total, l) => total + l.heures, 0)
  const etudiantsAvecHeures = etudiants.filter((l) => l.heures > 0).length
  const professeursActifs = professeurs.filter((l) => l.heures > 0).length

  return (
    <AdminLayout actif="Heures & forfaits">
      <EnTetePage
        compact
        titre="Heures & forfaits"
        description="Vue d’ensemble des heures de cours de l’établissement : ce que chaque étudiant a consommé, et ce que chaque professeur a enseigné."
      />

      <GuidePage
        id="admin-heures"
        compact
        etapes={[
          <>
            Les compteurs ne se saisissent pas : ils se remplissent automatiquement quand une séance passe au statut{' '}
            <strong>terminée</strong> depuis le calendrier du professeur.
          </>,
          <>
            La colonne <strong>Étudiants</strong> sert au suivi des forfaits. La colonne <strong>Professeurs</strong>{' '}
            sert de base au calcul des rémunérations dans la page Paiements.
          </>,
          <>
            Un écart entre les deux totaux est normal : une séance collective consomme une heure pour chaque élève
            inscrit, mais n’en compte qu’une seule pour le professeur.
          </>,
        ]}
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <EtatChargementStats tuiles={4} />
          <EtatChargement lignes={2} hauteur={200} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GrilleStats min={160} compact>
            <Stat compact libelle="Heures suivies" valeur={totalConsommees} unite="h" ton="or" aide="Cumul côté étudiants" />
            <Stat compact libelle="Heures enseignées" valeur={totalEnseignees} unite="h" ton="bleu" aide="Cumul côté professeurs" />
            <Stat
              compact
              libelle="Étudiants ayant démarré"
              valeur={`${etudiantsAvecHeures} / ${etudiants.length}`}
              ton="teal"
              aide="Au moins une séance clôturée"
            />
            <Stat
              compact
              libelle="Professeurs en activité"
              valeur={`${professeursActifs} / ${professeurs.length}`}
              ton="violet"
              aide="Au moins une séance clôturée"
            />
          </GrilleStats>

          <div className="grille-deux">
            <TableauHeures
              compact
              titre="Étudiants"
              description="Heures consommées sur leur forfait ou leur vague, du plus avancé au moins avancé."
              lignes={etudiants}
              etiquette="h suivies"
              messageVide="Aucun étudiant n’a encore de séance clôturée. Les compteurs démarreront dès la première séance terminée."
            />
            <TableauHeures
              compact
              titre="Professeurs"
              description="Heures effectivement enseignées, base de calcul des rémunérations."
              lignes={professeurs}
              etiquette="h enseignées"
              messageVide="Aucun professeur n’a encore de séance clôturée."
            />
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function TableauHeures({
  titre,
  description,
  lignes,
  etiquette,
  messageVide,
  compact,
}: {
  titre: string
  description: string
  lignes: LigneHeures[]
  etiquette: string
  messageVide: string
  compact?: boolean
}) {
  const triees = [...lignes].sort((a, b) => b.heures - a.heures)
  const maximum = triees[0]?.heures ?? 0

  return (
    <Section compact={compact} titre={titre} description={description} compteur={triees.length}>
      {triees.length === 0 ? (
        <EtatVide compact icone="heures" titre="Aucune heure enregistrée" description={messageVide} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {triees.map(({ profile, heures }) => (
            <div key={profile.id} className="row-hl" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ width: 27, height: 27, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                {initiales(profile)}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--ink)' }}>
                  {profile.prenom} {profile.nom}
                </span>
                {/* Barre de proportion relative au plus gros compteur : elle rend la
                    répartition lisible d'un coup d'œil, là où une colonne de nombres oblige à
                    comparer ligne à ligne. */}
                <span style={{ display: 'block', height: 4, borderRadius: 999, background: 'rgba(0,0,0,.3)', overflow: 'hidden' }}>
                  <span
                    style={{
                      display: 'block',
                      height: '100%',
                      width: maximum > 0 ? `${(heures / maximum) * 100}%` : '0%',
                      background: 'linear-gradient(90deg,#5eb3ff,#e9cf94)',
                      borderRadius: 999,
                    }}
                  />
                </span>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', flexShrink: 0 }}>
                {heures} {etiquette}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
