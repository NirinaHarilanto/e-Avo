import { useNavigate, useParams } from 'react-router-dom'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfesseurDetailAdmin, type EleveDuProfesseur } from '../../hooks/useProfesseurDetailAdmin'
import { useTimesheets } from '../../hooks/useTimesheets'
import { useRafraichirSurNotification } from '../../hooks/useRafraichirSurNotification'
import { useProfileContext } from '../../context/ProfileContext'
import { InformationsPersonnelles } from '../shared/InformationsPersonnelles'
import { SupprimerCompte } from '../shared/SupprimerCompte'
import { initiales } from '../etudiants/DossierEtudiantVue'
import { EnTetePage, BoutonRetour } from '../ui/EnTetePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { formaterHeures } from '../../lib/heures'
import { KpiSatisfaction } from './KpiSatisfaction'
import { DetacherVisioEtablissement } from './DetacherVisioEtablissement'
import { TimesheetsAdmin } from '../admin/TimesheetsAdmin'

export function ProfesseurDetailAdmin() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { detail, loading, erreur, recharger } = useProfesseurDetailAdmin(id)
  /* Même clé de cache que PaiementsAdmin.tsx (« admin ») : tous les TimeSheets de
     l'établissement sont déjà potentiellement en cache, filtrés ici sur ce seul professeur —
     aucune requête dupliquée si l'admin a déjà visité Paiements. */
  const { timesheets, loading: chargementTimesheets, recharger: rechargerTimesheets } = useTimesheets('admin')
  const { derniereNotification } = useProfileContext()
  useRafraichirSurNotification(derniereNotification, ['timesheet_soumis', 'timesheet_valide', 'timesheet_refuse'], rechargerTimesheets)
  const timesheetsProfesseur = timesheets.filter((t) => t.timesheet.teacher_id === id)

  return (
    <AdminLayout actif="Professeurs">
      {loading ? (
        <EtatChargement lignes={3} hauteur={110} />
      ) : erreur || !detail ? (
        <MessageErreur>{erreur ?? 'Professeur introuvable.'}</MessageErreur>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <EnTetePage
            avant={<BoutonRetour onClick={() => navigate('/admin/professeurs')} label="Tous les professeurs" />}
            media={
              <span style={{ width: 54, height: 54, borderRadius: 999, background: 'var(--accent-blue-gradient)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                {initiales(detail.professeur)}
              </span>
            }
            titre={`${detail.professeur.prenom} ${detail.professeur.nom}`}
            description={detail.professeur.email}
            actions={
              <SupprimerCompte personne={detail.professeur} onSupprime={() => navigate('/admin/professeurs')} />
            }
          />

          <GrilleStats>
            <Stat libelle="Élèves actifs" valeur={detail.eleves.length} ton="bleu" aide="Attributions en cours" />
            <Stat libelle="Heures enseignées" valeur={formaterHeures(detail.heuresTotalEnseignees)} ton="or" aide="Total depuis son arrivée" />
            <Stat
              libelle="Taux individuel"
              valeur={detail.professeur.taux_horaire_individuel ? `${detail.professeur.taux_horaire_individuel}` : '—'}
              unite={detail.professeur.taux_horaire_individuel ? 'Ar/h' : undefined}
              ton={detail.professeur.taux_horaire_individuel ? 'teal' : 'alerte'}
            />
            <Stat
              libelle="Taux duo"
              valeur={detail.professeur.taux_horaire_duo ? `${detail.professeur.taux_horaire_duo}` : '—'}
              unite={detail.professeur.taux_horaire_duo ? 'Ar/h' : undefined}
              ton={detail.professeur.taux_horaire_duo ? 'teal' : 'alerte'}
            />
            <Stat
              libelle="Taux collectif"
              valeur={detail.professeur.taux_horaire_collectif ? `${detail.professeur.taux_horaire_collectif}` : '—'}
              unite={detail.professeur.taux_horaire_collectif ? 'Ar/h' : undefined}
              ton={detail.professeur.taux_horaire_collectif ? 'teal' : 'alerte'}
            />
          </GrilleStats>

          <KpiSatisfaction teacherId={detail.professeur.id} />

          <DetacherVisioEtablissement
            teacherId={detail.professeur.id}
            nombreSeances={detail.seancesHergeesParEtablissement}
            onDetache={recharger}
          />

          {/* Résumé des TimeSheets de ce professeur — demande client du 2026-10-12 : « on doit
              retrouver un bloc qui résume le timesheet de chaque professeur (demande de
              validation par l'admin, les historiques, etc.) ». Réutilise TimesheetsAdmin tel
              quel (filtré sur ce seul professeur) : même fenêtre de validation/refus/modification
              qu'à la page Paiements, un seul endroit à maintenir. */}
          <Section
            titre="TimeSheets"
            description="Les relevés d'heures envoyés par ce professeur, à valider ou déjà traités."
            compteur={timesheetsProfesseur.length}
            padding={22}
          >
            <TimesheetsAdmin timesheets={timesheetsProfesseur} loading={chargementTimesheets} erreur={null} onChange={rechargerTimesheets} />
          </Section>

          <div className="grille-dossier">
            <Section
              titre="Élèves attribués"
              description="Les élèves actuellement suivis par ce professeur, avec le détail de leurs forfaits."
              compteur={detail.eleves.length}
              padding={22}
            >
              {detail.eleves.length === 0 ? (
                <EtatVide
                  icone="etudiants"
                  titre="Aucun élève attribué"
                  description="L’attribution se fait depuis le dossier de l’élève, page Étudiants : ouvrez son dossier puis choisissez ce professeur dans la colonne de droite."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {detail.eleves.map((e) => (
                    <LigneEleve key={e.eleve.id} eleveDuProfesseur={e} />
                  ))}
                </div>
              )}
            </Section>

            <InformationsPersonnelles personne={detail.professeur} onChange={recharger} />
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function LigneEleve({ eleveDuProfesseur }: { eleveDuProfesseur: EleveDuProfesseur }) {
  const { eleve, affectation, heuresEnseignees, packages } = eleveDuProfesseur
  return (
    <div className="card card-lift" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ width: 38, height: 38, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
          {initiales(eleve)}
        </span>
        <div style={{ flexGrow: 1, minWidth: 160 }}>
          <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
            {eleve.prenom} {eleve.nom}
          </span>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {affectation.langue ?? 'Langue non précisée'} · depuis le {new Date(affectation.date_debut).toLocaleDateString('fr-FR')}
          </div>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>{formaterHeures(heuresEnseignees)} enseignées</span>
      </div>
      {packages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
          {packages.map((pkg) => (
            <div key={pkg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>
                Forfait {pkg.type_programme === 'duo' ? 'duo' : 'individuel'} · {pkg.total_heures} h
              </span>
              <span style={{ color: 'var(--ink-2)' }}>{pkg.echeance ? `Échéance ${new Date(pkg.echeance).toLocaleDateString('fr-FR')}` : 'Sans échéance'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
