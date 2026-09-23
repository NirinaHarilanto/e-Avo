import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur } from '../../hooks/useCalendrierProfesseur'
import { initiales } from '../etudiants/DossierEtudiantVue'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, EtatChargementStats } from '../ui/Etats'
import { formaterHeures } from '../../lib/heures'
import { KpiSatisfaction } from './KpiSatisfaction'

export function HeuresProfesseur() {
  const { profile } = useProfileContext()
  const { seances, heuresEnseignees, loading } = useCalendrierProfesseur(profile?.id)

  const parEtudiant = new Map<string, { prenom: string | null; nom: string | null; heures: number; seances: number }>()
  for (const seance of seances) {
    if (seance.session.statut !== 'terminee') continue
    for (const inscription of seance.inscriptions) {
      const existant = parEtudiant.get(inscription.student_id) ?? {
        prenom: inscription.etudiant?.prenom ?? null,
        nom: inscription.etudiant?.nom ?? null,
        heures: 0,
        seances: 0,
      }
      existant.heures += seance.session.duree_minutes / 60
      existant.seances += 1
      parEtudiant.set(inscription.student_id, existant)
    }
  }
  const repartition = [...parEtudiant.entries()].sort((a, b) => b[1].heures - a[1].heures)
  const seancesCloturees = seances.filter((s) => s.session.statut === 'terminee').length
  const aCloturer = seances.filter((s) => s.session.statut === 'planifiee' && s.session.debut < new Date().toISOString()).length
  const maximum = repartition[0]?.[1].heures ?? 0

  return (
    <ProfesseurLayout actif="Mes heures">
      <EnTetePage
        titre="Mes heures"
        description="Le décompte de vos heures enseignées, élève par élève. C’est ce total qui sert de base au calcul de votre rémunération par l’établissement."
      />

      <GuidePage
        id="professeur-heures"
        etapes={[
          <>
            Une séance ne compte dans ce total qu’une fois <strong>clôturée</strong> depuis votre calendrier. Tant
            qu’elle reste « planifiée », elle n’est pas comptabilisée.
          </>,
          <>
            Pensez donc à clôturer vos séances passées : c’est le geste qui déclenche à la fois votre décompte d’heures
            et la mise à jour du forfait de l’élève.
          </>,
          <>
            Une séance collective compte <strong>une heure pour vous</strong>, même si plusieurs élèves y participent.
            La répartition ci-dessous indique donc le temps passé avec chacun, pas la somme de votre total.
          </>,
        ]}
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <EtatChargementStats tuiles={3} />
          <EtatChargement lignes={1} hauteur={200} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <GrilleStats>
            <Stat libelle="Total heures enseignées" valeur={formaterHeures(heuresEnseignees)} ton="or" />
            <Stat libelle="Séances clôturées" valeur={seancesCloturees} ton="teal" />
            <Stat
              libelle="Séances passées à clôturer"
              valeur={aCloturer}
              ton={aCloturer > 0 ? 'alerte' : 'neutre'}
              aide={aCloturer > 0 ? 'Elles ne sont pas encore comptées dans votre total' : 'Vous êtes à jour'}
            />
          </GrilleStats>

          <Section
            titre="Répartition par élève"
            description="Basée uniquement sur les séances clôturées, de l’élève le plus suivi au moins suivi."
            compteur={repartition.length}
          >
            {repartition.length === 0 ? (
              <EtatVide
                icone="heures"
                titre="Aucune séance clôturée pour le moment"
                description="Dès que vous aurez clôturé une première séance depuis votre calendrier, la répartition de vos heures apparaîtra ici."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {repartition.map(([studentId, ligne]) => (
                  <div key={studentId} className="row-hl" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 6px', borderBottom: '1px solid var(--border-soft)' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {initiales({ prenom: ligne.prenom, nom: ligne.nom })}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexGrow: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                        {ligne.prenom} {ligne.nom}
                      </span>
                      <span style={{ display: 'block', height: 4, borderRadius: 999, background: 'rgba(0,0,0,.3)', overflow: 'hidden' }}>
                        <span
                          style={{
                            display: 'block',
                            height: '100%',
                            width: maximum > 0 ? `${(ligne.heures / maximum) * 100}%` : '0%',
                            background: 'linear-gradient(90deg,#5eb3ff,#e9cf94)',
                            borderRadius: 999,
                          }}
                        />
                      </span>
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>
                      {ligne.seances} séance{ligne.seances > 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', flexShrink: 0 }}>{formaterHeures(ligne.heures)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <KpiSatisfaction teacherId={profile?.id} />
        </div>
      )}
    </ProfesseurLayout>
  )
}
