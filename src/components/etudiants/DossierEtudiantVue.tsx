import { useState, type ReactNode } from 'react'
import type { DossierEtudiant, PeriodeProfesseur, SeanceDuParcours } from '../../hooks/useDossierEtudiant'
import { useNiveauxEtudiant } from '../../hooks/useNiveauxEtudiant'
import { getJoinUrl } from '../../lib/visio'
import { estRempli } from '../../lib/diagnostic'
import {
  libelleActiviteEtudiant,
  libelleStatutProfil,
  tonActiviteEtudiant,
  tonStatutProfil,
  type ActiviteEtudiant,
} from '../../lib/statutProfil'
import {
  formaterHeures,
  formaterMinutes,
  totalHeuresCumulees as calculerTotalHeuresCumulees,
  heuresRestantes as calculerHeuresRestantes,
} from '../../lib/heures'
import { RecapitulatifDiagnostic } from '../prospects/FormulaireDiagnosticCall'
import type { Database } from '../../types/database.types'
import { LABEL_NIVEAU_CLASSE, LABEL_CRENEAU_CLASSE } from '../../lib/classesCollectif'
import { LABEL_TYPE_PROGRAMME } from '../../lib/paiements'
import { niveauDefinitif } from '../../lib/niveauEtudiant'
import { GrilleStats, Stat } from '../ui/Stat'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { LigneInfo } from '../ui/Champ'
import { Icone } from '../ui/Icones'
import { Onglets, type Onglet } from '../ui/Onglets'
import { ListeRepliable, TexteRepliable } from '../ui/Repliable'
import { HistoriqueNiveauModale } from './HistoriqueNiveauModale'
import { EditerSeancePlanifieeModale } from '../shared/EditerSeancePlanifieeModale'
import { DetailSeanceModale } from '../shared/DetailSeanceModale'

type Profile = Database['public']['Tables']['profiles']['Row']

export function initiales(profile: Pick<Profile, 'nom' | 'prenom'>) {
  return `${(profile.prenom?.[0] ?? '').toUpperCase()}${(profile.nom?.[0] ?? '').toUpperCase()}`
}

const boutonPanneauStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: 'var(--accent-blue)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '6px 12px',
  cursor: 'pointer',
}

/* Fusionne l'ancien résumé compact (une ligne dans le parcours) et l'ancienne carte « Appel
   diagnostic » détaillée (rythme convenu, notes) : un seul affichage, dans l'onglet Parcours
   pédagogique, plutôt que la même information répétée à deux endroits du dossier. */
function BlocDiagnostic({ diagnostic, tarifChoisi }: { diagnostic: NonNullable<DossierEtudiant['diagnostic']>; tarifChoisi?: DossierEtudiant['tarifChoisi'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--voile-doux, rgba(255,255,255,.03))', padding: '15px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-2)', flexGrow: 1 }}>
          Appel diagnostic réalisé{diagnostic.niveau_evalue ? ` · niveau initial ${diagnostic.niveau_evalue}` : ''}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>{new Date(diagnostic.date_appel).toLocaleDateString('fr-FR')}</span>
      </div>
      {diagnostic.rythme_convenu && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Rythme convenu : {diagnostic.rythme_convenu}</span>}
      {/* Programme collectif uniquement (0054) : pour individuel/duo, ce choix a déjà donné lieu
          à un vrai forfait facturable (onglet Programme) — ici, la vague ne portant pas de
          montant, c'est le seul endroit du dossier où ce choix reste visible. */}
      {tarifChoisi && (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Forfait choisi à l'inscription (indicatif, à reporter sur les paiements manuels) : {tarifChoisi.titre} ·{' '}
          {tarifChoisi.prix.toLocaleString('fr-FR')} Ar{tarifChoisi.unite}
        </span>
      )}
      {diagnostic.notes && (
        <div style={{ background: 'var(--fond-champ, rgba(0,0,0,.22))', borderRadius: 12, padding: '11px 13px' }}>
          <TexteRepliable
            texte={`« ${diagnostic.notes} »`}
            style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}
          />
        </div>
      )}
      {/* Réponses à la trame remplie pendant l'appel (0050) : elles suivent le prospect dans son
          dossier d'élève, ce qui est précisément ce que la demande client appelle « enregistrer
          les résultats dans les informations des étudiants ». */}
      {estRempli(diagnostic.reponses ?? {}) && (
        <div style={{ background: 'var(--fond-champ, rgba(0,0,0,.22))', borderRadius: 12, padding: '13px 15px' }}>
          <RecapitulatifDiagnostic reponses={diagnostic.reponses} />
        </div>
      )}
    </div>
  )
}

/* Variante DUO de BlocDiagnostic (0065, demande client du 2026-09-23) : « pour les informations
   qui diffèrent entre les deux personnes [profil, objectifs, niveau]... afficher les
   informations des deux personnes formant le DUO ». Chaque membre a désormais son propre
   diagnostic_calls (trame à deux vitesses, 0060) — les deux s'affichent l'un sous l'autre,
   nommés, plutôt qu'un seul comme avant cette séparation. Retombe sur l'affichage simple si
   l'étudiant n'est pas en duo. */
function BlocDiagnosticDuo({
  diagnostic,
  diagnosticPartenaire,
  etudiant,
  duoPartenaire,
  tarifChoisi,
}: {
  diagnostic: DossierEtudiant['diagnostic']
  diagnosticPartenaire: DossierEtudiant['diagnosticPartenaire']
  etudiant: Profile
  duoPartenaire: Profile | null
  tarifChoisi?: DossierEtudiant['tarifChoisi']
}) {
  if (!duoPartenaire) {
    return diagnostic ? <BlocDiagnostic diagnostic={diagnostic} tarifChoisi={tarifChoisi} /> : null
  }
  if (!diagnostic && !diagnosticPartenaire) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {diagnostic && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            {etudiant.prenom} {etudiant.nom}
          </span>
          <BlocDiagnostic diagnostic={diagnostic} tarifChoisi={tarifChoisi} />
        </div>
      )}
      {diagnosticPartenaire && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            {duoPartenaire.prenom} {duoPartenaire.nom}
          </span>
          <BlocDiagnostic diagnostic={diagnosticPartenaire} />
        </div>
      )}
    </div>
  )
}

/* Historique des forfaits successifs — demande client du 2026-09-21 : « un étudiant peut prendre
   plusieurs forfaits au cours de son apprentissage ». `packages` est déjà trié du plus récent au
   plus ancien par useDossierEtudiant, et sa première ligne est le forfait courant détaillé
   juste au-dessus : on ne répète donc que les précédents. Rien ne s'affiche pour un élève qui
   n'en a souscrit qu'un seul. */
function HistoriqueForfaits({ packages }: { packages: DossierEtudiant['packages'] }) {
  const precedents = packages.slice(1)
  if (precedents.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Forfaits précédents · {precedents.length}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
        <ListeRepliable visibles={3} nom="forfaits précédents">
          {precedents.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '9px 13px',
                borderBottom: '1px solid var(--border-soft)',
              }}
            >
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1 }}>
                {LABEL_TYPE_PROGRAMME[p.type_programme]} · {formaterHeures(p.total_heures)}
                {p.essai && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', background: 'rgba(233,207,148,.14)', border: '1px solid rgba(233,207,148,.32)', borderRadius: 999, padding: '2px 7px' }}>
                    {/* 'prolonge' (0115) : tranche close par une prolongation, la suivante a pris
                        le relais — à distinguer d'un essai encore en attente de décision. */}
                    Essai{' '}
                    {p.essai_resultat === 'poursuivi'
                      ? '· poursuivi'
                      : p.essai_resultat === 'arrete'
                        ? '· arrêté'
                        : p.essai_resultat === 'prolonge'
                          ? '· prolongé'
                          : ''}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {p.montant !== null ? `${p.montant.toLocaleString('fr-FR')} Ar` : '—'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
                souscrit le {new Date(p.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          ))}
        </ListeRepliable>
      </div>
    </div>
  )
}

function EtapeAvancement({ fait, label }: { fait: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: fait ? '#1a0f38' : 'var(--muted-2)',
          background: fait ? 'var(--accent-teal)' : 'transparent',
          border: fait ? 'none' : '1px dashed var(--muted-2)',
        }}
      >
        {fait && <Icone nom="valide" taille={11} />}
      </span>
      <span style={{ fontSize: 12, color: fait ? 'var(--ink-2)' : 'var(--muted)' }}>{label}</span>
    </div>
  )
}

function StatutSeance({ enrollment, statutSession }: { enrollment: { present: boolean | null }; statutSession: string }) {
  if (statutSession === 'planifiee') {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)' }}>Planifiée</span>
  }
  if (statutSession === 'annulee') {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>Annulée</span>
  }
  // 0085 : absence à la clôture, séance reportée — ni l'élève ni le professeur ne sont
  // impactés. À distinguer d'« Absent(e) » (ci-dessous) : celui-ci vaudrait pour une séance
  // COMPTÉE malgré l'absence (choix « Comptabiliser »), qui reste bien « terminée ».
  if (statutSession === 'reportee') {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning, #e0a94d)' }}>Reportée</span>
  }
  if (enrollment.present === true) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-teal)' }}>Présent(e)</span>
  }
  if (enrollment.present === false) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>Absent(e)</span>
  }
  return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>—</span>
}

/* Bloc d'identité du professeur d'une période, repris par la carte latérale et l'en-tête de
   période — il était jusqu'ici recopié trois fois à l'identique dans ce fichier. */
function IdentiteProfesseur({ periode, taille = 46 }: { periode: PeriodeProfesseur; taille?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
      <span
        style={{
          width: taille,
          height: taille,
          borderRadius: taille / 3,
          background: 'var(--accent-blue-gradient)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 14,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {periode.professeur ? initiales(periode.professeur) : '?'}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
          {periode.professeur ? `${periode.professeur.prenom} ${periode.professeur.nom}` : 'Professeur supprimé'}
          {periode.professeur?.status === 'suspended' && <BadgeProfesseurSupprime />}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{periode.affectation.langue ?? 'Langue non précisée'}</span>
      </div>
    </div>
  )
}

/* Un professeur dont le nom est restauré dans ce parcours (demande client du 2026-10-10, voir
   useDossierEtudiant.ts) n'en reste pas moins un compte supprimé : ce badge le rappelle, pour que
   le nom retrouvé se lise comme une TRACE historique, jamais comme un professeur qu'on pourrait
   recontacter ou réaffecter depuis cette fiche. */
function BadgeProfesseurSupprime() {
  return (
    <span
      style={{
        marginLeft: 8,
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--muted)',
        background: 'var(--voile, rgba(255,255,255,.06))',
        border: '1px solid var(--border-soft)',
        borderRadius: 999,
        padding: '2px 8px',
        verticalAlign: 'middle',
      }}
    >
      Compte supprimé
    </span>
  )
}

function BlocPeriode({
  periode,
  estActuelle,
  onClickSeance,
}: {
  periode: PeriodeProfesseur
  estActuelle: boolean
  /* Toujours fourni (même en lecture seule élève/professeur) — demande client du 2026-10-19 :
     une séance clôturée n'avait plus aucune ligne cliquable, donc plus aucun moyen de revoir son
     compte rendu depuis le parcours. L'appelant (DossierEtudiantVue) décide lui-même, par
     séance, s'il ouvre la reprogrammation (encore planifiée, autorisé) ou la fiche en lecture
     seule (tous les autres cas) — voir onClickSeance ci-dessous. */
  onClickSeance: (seance: SeanceDuParcours) => void
}) {
  // « enseignées » ne doit compter que les séances réellement COMPTÉES (statut « terminée ») —
  // avant ce filtre, une séance encore planifiée (future) ou reportée (0085, demande client du
  // 2026-09-30 : « il ne faut pas la comptabiliser comme une heure enseignée ») gonflait ce
  // total au même titre qu'une séance effectivement tenue. `heuresConsommees`/`heuresEnseignees`
  // globaux (vues `student_hours_summary`/`teacher_hours_summary`, dérivées de `hour_ledger`)
  // n'avaient PAS ce bug : `hour_ledger` n'écrit jamais rien pour une séance reportée
  // (api/professeur/cloturer-seance.ts) — seul ce total PAR PÉRIODE, recalculé ici depuis les
  // séances brutes plutôt que depuis le grand livre, y était exposé.
  const heures = periode.seances.filter((s) => s.session.statut === 'terminee').reduce((total, s) => total + s.session.duree_minutes / 60, 0)
  return (
    <div
      style={{
        borderRadius: 16,
        border: estActuelle ? '1px solid rgba(169,140,255,.3)' : '1px solid var(--border)',
        background: estActuelle ? 'var(--hoc-pastille, rgba(42,26,82,.6))' : 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 18px', borderBottom: periode.seances.length ? '1px solid var(--border-soft)' : 'none' }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: estActuelle ? 'var(--accent-blue-gradient)' : 'var(--voile, rgba(255,255,255,.06))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: estActuelle ? '#fff' : 'var(--muted)',
            fontSize: 14,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {periode.professeur ? initiales(periode.professeur) : '?'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1, minWidth: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span className="brand-font" style={{ fontSize: 16, color: 'var(--ink)' }}>
              {periode.professeur ? `${periode.professeur.prenom} ${periode.professeur.nom}` : 'Professeur supprimé'}
            </span>
            {periode.professeur?.status === 'suspended' && <BadgeProfesseurSupprime />}
            {estActuelle && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-teal)', background: 'rgba(111,227,192,.14)', border: '1px solid rgba(111,227,192,.3)', borderRadius: 999, padding: '3px 9px' }}>
                Professeur actuel
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {periode.affectation.langue ?? 'Langue non précisée'} · depuis le {new Date(periode.affectation.date_debut).toLocaleDateString('fr-FR')}
            {periode.affectation.date_fin ? ` jusqu'au ${new Date(periode.affectation.date_fin).toLocaleDateString('fr-FR')}` : ''}
          </span>
          {periode.affectation.motif_changement && (
            <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Motif du changement : {periode.affectation.motif_changement}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
              {periode.seances.length}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>séances</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
              {formaterHeures(heures)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>enseignées</span>
          </div>
        </div>
      </div>

      {periode.seances.length > 0 && (
        <div>
          {/* En-têtes purement visuels : chaque ligne reste lisible seule à la lecture d'écran
              (une date, un libellé, une durée, un statut), donc les répéter en rôles ARIA de
              tableau n'apporterait rien et imposerait un balisage de cellules complet. */}
          <div
            aria-hidden
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 18px', background: 'var(--fond-champ, rgba(0,0,0,.22))', borderBottom: '1px solid var(--border-soft)' }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, width: 90, flexShrink: 0 }}>
              Date
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, flexGrow: 1 }}>
              Séance
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Durée</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, width: 72, textAlign: 'right' }}>
              Présence
            </span>
          </div>
          {/* Une période peut compter des dizaines de séances : n'en montrer que les premières
              garde le parcours lisible quand plusieurs périodes s'enchaînent. */}
          <ListeRepliable visibles={3} nom="séances">
          {periode.seances.map((seance) => {
            return (
              <div
                key={seance.enrollment.id}
                className="row-hl"
                onClick={() => onClickSeance(seance)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 18px', borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 12, color: 'var(--muted)', width: 90, flexShrink: 0 }}>
                  {new Date(seance.session.debut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </span>
                {/* L'enquête de satisfaction par séance a été retirée le 2026-10-19 (demande
                    client 8) : elle n'est plus demandée à chaque cours mais deux fois par
                    parcours, à la moitié des heures puis à trois heures de la fin — voir
                    EnqueteParcours.tsx et EnquetesParcoursAffichage.tsx. */}
                <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {seance.session.type === 'individuel' ? 'Séance individuelle' : 'Séance collective'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{formaterMinutes(seance.session.duree_minutes)}</span>
                <span style={{ width: 72, textAlign: 'right' }}>
                  <StatutSeance enrollment={seance.enrollment} statutSession={seance.session.statut} />
                </span>
              </div>
            )
          })}
          </ListeRepliable>
        </div>
      )}
    </div>
  )
}

type OngletDossier = 'parcours' | 'informations' | 'enquetes' | 'professeur' | 'programme' | 'planning'

interface DossierEtudiantVueProps {
  dossier: DossierEtudiant
  /* Blocs admin uniquement — absents en vue élève/professeur. */
  panneauProfesseur?: ReactNode
  panneauInformations?: ReactNode
  /* Enquêtes de satisfaction du parcours (0130) — onglet séparé depuis le 2026-10-19 (capture
     client à l'appui) : vivait jusqu'ici sous « Informations personnelles », sans rapport avec le
     contenu de cet onglet (nom, coordonnées, adresse…), ce qui le noyait en bas de page. Même
     contenu qu'avant (EnquetesParcoursAffichage, élève + binôme s'il y en a un), simplement
     déplacé par l'appelant dans ce nouveau prop plutôt que dans panneauInformations. */
  panneauEnquetes?: ReactNode
  /* Choix initial du programme (individuel/duo/collectif), affiché tant que l'étudiant n'a ni
     forfait ni vague. */
  panneauChoixInitial?: ReactNode
  /* Formulaire d'édition du forfait existant, replié derrière le bouton « Modifier ». */
  panneauForfaitEdition?: ReactNode
  /* Formulaire de planning prévisionnel (individuel/duo), replié derrière un bouton dédié.
     Fonction plutôt que nœud direct : elle reçoit `fermer`, à appeler par l'appelant une fois la
     création réussie, pour que ce composant puisse replier le formulaire et révéler aussitôt le
     résumé en lecture seule (lignes 531+) — demande client du 2026-09-16, « il faut afficher le
     planning prévisionnel créé mais plus les paramètres de planification, instantanément ».
     Avant ce prop, `onCree` ne rechargeait que les données ; rien ne refermait le formulaire, qui
     restait affiché indéfiniment par-dessus le planning qu'il venait de créer. */
  panneauPlanification?: (fermer: () => void) => ReactNode
  /* Formulaire d'assignation/changement de vague pour le programme collectif. */
  panneauVague?: ReactNode
  /* Décision à prendre après l'heure d'essai (0057) — admin uniquement, absent en lecture seule. */
  panneauDecisionEssai?: ReactNode
  /* Bouton d'ajout de forfait supplémentaire (0061) — admin uniquement. */
  panneauAjoutForfait?: ReactNode
  /* Demande de forfait supplémentaire (0061) — élève uniquement, exclusif avec
     panneauAjoutForfait (jamais les deux à la fois sur un même dossier). */
  panneauDemandeForfait?: ReactNode
  /* Bouton + pop-up de suppression du compte — admin uniquement, comme les autres panneaux. */
  panneauSuppression?: ReactNode
  /* Bouton brillant de synthèse des comptes rendus (demande client du 2026-09-30) — admin et
     professeur, jamais l'élève : rendu dans l'en-tête, à côté des actions de compte. Passé en
     `ReactNode` plutôt que déduit ici d'un booléen, parce que la PORTÉE de la synthèse diffère
     selon l'espace (tout l'établissement pour l'admin, ses propres cours pour le professeur) et
     que c'est l'appelant qui la connaît. */
  panneauSynthese?: ReactNode
  /* Badge(s) ajouté(s) à la ligne d'identité de l'en-tête, après le statut et la langue — sert au
     tag « Ancien élève » côté professeur (demande client du 2026-09-30). */
  badgesSupplementaires?: ReactNode
  /* Activité du parcours (2026-10-19), quand l'appelant sait si le forfait est épuisé : elle
     remplace alors le badge de statut de compte dans l'en-tête. Omise côté professeur et côté
     élève, qui n'ont pas ce calcul sous la main. */
  activite?: ActiviteEtudiant | null
  /* Autorise l'ajout d'une réévaluation de niveau depuis la fenêtre d'historique — admin
     uniquement, comme les autres panneaux d'action. */
  peutModifierNiveau?: boolean
  /* Autorise à cliquer une ligne du planning prévisionnel pour la reprogrammer — admin
     uniquement depuis cette vue (le professeur passe par son propre calendrier, voir
     CalendrierProfesseur.tsx : les forfaits/le programme d'un élève ne lui sont pas ouverts,
     scope volontaire déjà en place ailleurs dans le dossier). */
  peutModifierPlanning?: boolean
  /* Rechargement du dossier après une action qui ne passe pas par un panneau externe (édition
     d'une séance depuis la liste ci-dessous, par exemple) — les panneauXxx gèrent déjà leur
     propre `onCree`/`onTermine`, celui-ci couvre ce que ce composant fait lui-même. */
  onDossierChange?: () => void
  /* Masque l'e-mail de l'élève dans l'en-tête — espace professeur (0061/2026-10-16) : le reste
     du masquage des coordonnées se fait via `panneauInformations` (voir
     InformationsPersonnelles.tsx), mais cette ligne-ci est rendue directement par ce composant,
     hors de ce panneau, donc pas couverte par lui. */
  masquerEmailEnTete?: boolean
}

/* Rendu du dossier étudiant, partagé entre la vue admin (avec actions) et l'espace élève/
   professeur en lecture seule — même contenu, seuls les panneaux d'action admin diffèrent. */
export function DossierEtudiantVue({
  dossier,
  panneauProfesseur,
  panneauInformations,
  panneauEnquetes,
  panneauChoixInitial,
  panneauForfaitEdition,
  panneauPlanification,
  panneauVague,
  panneauDecisionEssai,
  panneauAjoutForfait,
  panneauDemandeForfait,
  panneauSuppression,
  panneauSynthese,
  badgesSupplementaires,
  activite = null,
  peutModifierNiveau,
  peutModifierPlanning,
  onDossierChange,
  masquerEmailEnTete = false,
}: DossierEtudiantVueProps) {
  const {
    etudiant,
    periodes,
    periodeActuelle,
    diagnostic,
    diagnosticPartenaire,
    packages,
    cohorte,
    cohortClasse,
    professeurClasse,
    heuresConsommees,
    prochaineSeance,
    tarifChoisi,
    duoPartenaire,
  } = dossier
  const forfait = packages[0] ?? null
  /* Restant et progression se calculent sur le CUMUL des forfaits, pas seulement le dernier
     souscrit — un ajout de forfait (0061) additionne des heures à un total déjà entamé, il ne
     remplace jamais le précédent. */
  const totalHeuresCumulees = calculerTotalHeuresCumulees(packages)
  const heuresRestantes = calculerHeuresRestantes(packages, heuresConsommees)
  const [editionForfaitOuverte, setEditionForfaitOuverte] = useState(false)
  const [planificationOuverte, setPlanificationOuverte] = useState(false)
  const [editionVagueOuverte, setEditionVagueOuverte] = useState(false)
  const [historiqueNiveauOuvert, setHistoriqueNiveauOuvert] = useState(false)
  const [seanceEnEdition, setSeanceEnEdition] = useState<SeanceDuParcours | null>(null)
  const [seanceEnDetail, setSeanceEnDetail] = useState<SeanceDuParcours | null>(null)
  /* Une séance de classe collective ne se modifie plus depuis la fiche d'UN élève (demande
     client du 2026-10-12) : la classe entière partage le même horaire, donc le seul endroit
     cohérent pour la reprogrammer est « Cours collectifs » › Planning de la classe, qui prévient
     tous ses élèves d'un coup plutôt qu'un seul — ici, elle s'ouvre donc toujours en lecture
     seule, jamais en édition, même encore planifiée. */
  function onClickSeance(seance: SeanceDuParcours) {
    if (peutModifierPlanning && seance.session.statut === 'planifiee' && seance.session.type !== 'collectif') {
      setSeanceEnEdition(seance)
    } else {
      setSeanceEnDetail(seance)
    }
  }
  const [ongletDemande, setOngletDemande] = useState<OngletDossier>('parcours')
  const { evaluations: niveaux } = useNiveauxEtudiant(etudiant.id)
  const niveauActuel = niveauDefinitif(diagnostic, niveaux)
  /* Pour un binôme DUO, chaque personne a son propre niveau — jamais un seul niveau fondu pour
     les deux (demande client du 2026-09-23 : « il faut afficher les deux niveaux des deux
     personnes formant le DUO »). `duoPartenaire` peut être `null` (pas de duo), d'où le hook
     appelé avec un id éventuellement `undefined` — comportement déjà prévu par
     useNiveauxEtudiant (retourne un tableau vide tant qu'aucun id n'est fourni). */
  const { evaluations: niveauxPartenaire } = useNiveauxEtudiant(duoPartenaire?.id)
  const niveauActuelPartenaire = duoPartenaire ? niveauDefinitif(diagnosticPartenaire, niveauxPartenaire) : null
  const seancesTerminees = periodes.flatMap((p) => p.seances).filter((s) => s.session.statut === 'terminee')
  const assiduite =
    seancesTerminees.length > 0
      ? Math.round((seancesTerminees.filter((s) => s.enrollment.present).length / seancesTerminees.length) * 100)
      : null
  const professeurActuel = periodeActuelle
  /* Séances déjà planifiées (statut « planifiée ») pour la période en cours, triées
     chronologiquement — le planning prévisionnel affiché en lecture seule avant que l'admin ne
     clique « Modifier » pour rouvrir le formulaire de génération. */
  const seancesPlanifiees = (professeurActuel?.seances ?? [])
    .filter((s) => s.session.statut === 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))

  /* Les quatre blocs auparavant séparés (parcours, informations, professeur, forfait) tiennent
     dans une seule carte à onglets — leur contenu ne change pas, seul l'habillage se
     regroupe. Un onglet n'apparaît que s'il a quelque chose à montrer : en lecture seule
     (espace élève/professeur), « Informations personnelles » n'est par exemple jamais passé. */
  const onglets: Onglet<OngletDossier>[] = [
    { value: 'parcours', label: 'Parcours pédagogique' },
    ...(panneauInformations ? [{ value: 'informations' as const, label: 'Informations personnelles' }] : []),
    /* Onglet séparé depuis le 2026-10-19 — auparavant une section au bas d'« Informations
       personnelles », sans rapport avec son contenu (voir panneauEnquetes ci-dessus). */
    ...(panneauEnquetes ? [{ value: 'enquetes' as const, label: 'Enquêtes de satisfaction' }] : []),
    ...(professeurActuel || panneauProfesseur ? [{ value: 'professeur' as const, label: 'Professeur' }] : []),
    ...(forfait || cohorte || panneauChoixInitial ? [{ value: 'programme' as const, label: cohorte ? 'Programme' : 'Forfait' }] : []),
    /* Forfait et Planning étaient regroupés sous un seul onglet « Forfait & Planning » :
       séparés depuis le 2026-09-21 (demande client), le forfait portant désormais aussi
       l'historique des forfaits successifs. Le collectif n'a pas de planning par forfait
       (l'élève suit le calendrier de sa vague), donc pas d'onglet Planning dans ce cas. */
    ...(!cohorte && forfait ? [{ value: 'planning' as const, label: 'Planning' }] : []),
  ]
  const ongletActif = onglets.some((o) => o.value === ongletDemande) ? ongletDemande : onglets[0].value

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ width: 54, height: 54, borderRadius: 999, background: 'var(--voile, rgba(255,255,255,.06))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
            {initiales(etudiant)}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            {/* Nom du binôme dans l'en-tête du dossier (0062, demande client du 2026-09-22 :
                « rajoute les noms des deux personnes formant le DUO »). `dossier.duoPartenaire`
                n'existe que côté principal — c'est bien lui qui porte le dossier partagé, voir
                useDossierEtudiant. */}
            {duoPartenaire ? (
              <h2 style={{ fontSize: 22, color: 'var(--ink)', margin: 0 }}>
                {etudiant.prenom} {etudiant.nom} & {duoPartenaire.prenom} {duoPartenaire.nom}
              </h2>
            ) : (
              <h2 style={{ fontSize: 22, color: 'var(--ink)', margin: 0 }}>
                {etudiant.prenom} {etudiant.nom}
              </h2>
            )}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
              {duoPartenaire && (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', background: 'rgba(233,207,148,.14)', border: '1px solid rgba(233,207,148,.32)', borderRadius: 999, padding: '4px 11px' }}>
                  Duo{etudiant.duo_nom_groupe || duoPartenaire.duo_nom_groupe ? ` · ${etudiant.duo_nom_groupe || duoPartenaire.duo_nom_groupe}` : ''}
                </span>
              )}
              {/* Activité du PARCOURS quand l'appelant la connaît (espace admin depuis le
                  2026-10-19 : un forfait épuisé rend l'élève inactif, alors que son compte reste
                  approuvé), sinon le statut du compte comme avant — l'espace professeur et
                  l'espace étudiant n'ont pas les données du forfait à ce niveau. */}
              {activite ? (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: tonActiviteEtudiant(activite).color, background: tonActiviteEtudiant(activite).bg, border: `1px solid ${tonActiviteEtudiant(activite).border}`, borderRadius: 999, padding: '4px 11px' }}>
                  {libelleActiviteEtudiant(activite)}
                </span>
              ) : (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: tonStatutProfil(etudiant.status).color, background: tonStatutProfil(etudiant.status).bg, border: `1px solid ${tonStatutProfil(etudiant.status).border}`, borderRadius: 999, padding: '4px 11px' }}>
                  {libelleStatutProfil(etudiant.status)}
                </span>
              )}
              {(periodeActuelle ?? periodes[0])?.affectation.langue && (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-violet)', background: 'rgba(199,156,255,.12)', border: '1px solid rgba(199,156,255,.3)', borderRadius: 999, padding: '4px 11px' }}>
                  {(periodeActuelle ?? periodes[0]).affectation.langue}
                </span>
              )}
              {badgesSupplementaires}
              {!masquerEmailEnTete && etudiant.email && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{etudiant.email}</span>}
            </div>
          </div>
        </div>
        {(panneauSynthese || panneauSuppression) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {panneauSynthese}
            {panneauSuppression}
          </div>
        )}
      </div>

      <GrilleStats min={160} compact>
        <Stat
          compact
          libelle="Heures suivies"
          valeur={formaterHeures(heuresConsommees)}
          /* `totalHeuresCumulees` (somme de TOUS les forfaits souscrits), pas `forfait.total_heures`
             (le dernier souscrit seul) — demande client du 2026-10-10 : un forfait ajouté en
             prolongation d'un précédent encore en cours doit s'y voir cumulé. Avant ce correctif,
             un élève ayant consommé 18 h sur 20 puis prolongé de 10 h affichait « 18 / 10 h »
             (plus de 100 %) au lieu de « 18 / 30 h ». */
          unite={forfait ? `/ ${formaterHeures(totalHeuresCumulees)}` : undefined}
          ton="or"
          aide={forfait ? `Forfait${packages.length > 1 ? 's cumulés' : ''} de ${formaterHeures(totalHeuresCumulees)}` : 'Aucun forfait rattaché'}
        />
        <Stat
          compact
          libelle="Assiduité"
          valeur={assiduite === null ? '—' : `${assiduite} %`}
          ton="teal"
          aide={seancesTerminees.length > 0 ? `Sur ${seancesTerminees.length} séance${seancesTerminees.length > 1 ? 's' : ''} clôturée${seancesTerminees.length > 1 ? 's' : ''}` : 'Aucune séance clôturée'}
        />
        <Stat
          compact
          libelle="Prochaine séance"
          valeur={
            prochaineSeance ? (
              <span style={{ fontSize: 13.5 }}>
                {new Date(prochaineSeance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            ) : (
              <span style={{ fontSize: 13.5 }}>Aucune planifiée</span>
            )
          }
          ton="bleu"
          pied={
            prochaineSeance?.video ? (
              <a href={getJoinUrl(prochaineSeance.video)} target="_blank" rel="noreferrer" className="btn-shine btn-secondary" style={{ fontSize: 11, padding: '6px 11px' }}>
                Rejoindre la visio
              </a>
            ) : undefined
          }
        />
        <Stat
          compact
          libelle="Niveau évalué"
          valeur={
            duoPartenaire ? (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 15 }}>
                <span>
                  {etudiant.prenom} : {niveauActuel ?? '—'}
                </span>
                <span>
                  {duoPartenaire.prenom} : {niveauActuelPartenaire ?? '—'}
                </span>
              </span>
            ) : (
              (niveauActuel ?? '—')
            )
          }
          ton="violet"
          aide={diagnostic || niveaux.length > 0 || diagnosticPartenaire || niveauxPartenaire.length > 0 ? 'Établi lors de l’appel diagnostic' : 'Pas encore de diagnostic'}
          pied={
            (diagnostic || niveaux.length > 0) && (
              <button
                type="button"
                onClick={() => setHistoriqueNiveauOuvert(true)}
                style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-violet)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                {peutModifierNiveau ? "Voir l'historique · Modifier" : "Voir l'historique"}
              </button>
            )
          }
        />
      </GrilleStats>

      {/* Tant que le dossier n'a ni professeur ni programme, ce récapitulatif occupe l'espace
          utilement plutôt que de laisser un onglet « Professeur » ou « Programme » manquant sans
          explication ; il disparaît de lui-même une fois le dossier complet. */}
      {(!professeurActuel || (!forfait && !cohorte)) && (
        <Section titre="Avancement du dossier" padding="14px 16px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <EtapeAvancement fait={!!diagnostic} label="Appel diagnostic réalisé" />
            <EtapeAvancement fait={!!professeurActuel} label="Professeur attribué" />
            <EtapeAvancement fait={!!(forfait || cohorte)} label="Programme choisi (forfait ou vague)" />
          </div>
        </Section>
      )}

      {/* Les quatre blocs (parcours, informations, professeur, forfait) tenaient auparavant dans
          une grille à deux colonnes ; ils vivent maintenant dans une seule carte à onglets. */}
      <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <Onglets etiquette="Sections du dossier" actif={ongletActif} onChange={setOngletDemande} onglets={onglets} compact defilant />

        {ongletActif === 'parcours' && (
          <div>
            {periodes.length > 0 && (
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                {periodes.length} période{periodes.length > 1 ? 's' : ''} de suivi
                {periodes.length > 1 ? ` · ${periodes.length} professeurs depuis l’inscription` : ''}. Chaque période liste
                les séances du professeur concerné.
              </p>
            )}
            {periodes.length === 0 && (diagnostic || diagnosticPartenaire) && (
              <BlocDiagnosticDuo
                diagnostic={diagnostic}
                diagnosticPartenaire={diagnosticPartenaire}
                etudiant={etudiant}
                duoPartenaire={duoPartenaire}
                tarifChoisi={cohorte ? tarifChoisi : null}
              />
            )}
            {periodes.length === 0 && !diagnostic && !diagnosticPartenaire && (
              <EtatVide
                icone="seances"
                titre="Aucune séance enregistrée"
                description="Le parcours se remplit automatiquement dès qu’un professeur est attribué et que ses séances sont planifiées puis clôturées."
              />
            )}
            {periodes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {periodes.map((periode) => (
                  <BlocPeriode
                    key={periode.affectation.id}
                    periode={periode}
                    estActuelle={periode.affectation.id === periodeActuelle?.affectation.id}
                    onClickSeance={onClickSeance}
                  />
                ))}
                {(diagnostic || diagnosticPartenaire) && (
                  <BlocDiagnosticDuo
                    diagnostic={diagnostic}
                    diagnosticPartenaire={diagnosticPartenaire}
                    etudiant={etudiant}
                    duoPartenaire={duoPartenaire}
                    tarifChoisi={cohorte ? tarifChoisi : null}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {ongletActif === 'informations' && panneauInformations}

        {ongletActif === 'enquetes' && panneauEnquetes}

        {ongletActif === 'professeur' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {professeurActuel && <IdentiteProfesseur periode={professeurActuel} />}
            {panneauProfesseur}
          </div>
        )}

        {ongletActif === 'programme' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!forfait && !cohorte && panneauChoixInitial}

            {cohorte && (
              <>
                {panneauVague && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditionVagueOuverte((v) => !v)} style={boutonPanneauStyle}>
                      {editionVagueOuverte ? 'Annuler' : 'Changer'}
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <LigneInfo label="Vague" valeur={cohorte.nom} />
                  <LigneInfo label="Langue" valeur={cohorte.langue ?? '—'} />
                  <LigneInfo
                    label="Dates"
                    valeur={`${new Date(cohorte.date_debut).toLocaleDateString('fr-FR')} → ${new Date(cohorte.date_fin).toLocaleDateString('fr-FR')}`}
                  />
                  {cohortClasse && (
                    <>
                      <LigneInfo
                        label="Classe"
                        valeur={`${LABEL_NIVEAU_CLASSE[cohortClasse.niveau]}${cohortClasse.nom ? ` — ${cohortClasse.nom}` : ''}`}
                      />
                      <LigneInfo label="Créneau" valeur={LABEL_CRENEAU_CLASSE[cohortClasse.creneau]} />
                      <LigneInfo
                        label="Professeur de la classe"
                        valeur={professeurClasse ? `${professeurClasse.prenom} ${professeurClasse.nom}` : 'Non désigné'}
                      />
                    </>
                  )}
                </div>
                {editionVagueOuverte && panneauVague}
              </>
            )}

            {!cohorte && forfait && (
              <>
                {panneauForfaitEdition && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={() => setEditionForfaitOuverte((v) => !v)} style={boutonPanneauStyle}>
                      {editionForfaitOuverte ? 'Annuler' : 'Modifier'}
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <LigneInfo label="Programme" valeur={LABEL_TYPE_PROGRAMME[forfait.type_programme]} />
                  <LigneInfo label="Formule en cours" valeur={formaterHeures(forfait.total_heures)} />
                  <LigneInfo label="Montant" valeur={forfait.montant !== null ? `${forfait.montant.toLocaleString('fr-FR')} Ar` : '—'} />
                  <LigneInfo label="Consommées" valeur={formaterHeures(heuresConsommees)} />
                  <LigneInfo label="Restantes (tous forfaits cumulés)" valeur={formaterHeures(heuresRestantes)} />
                  <LigneInfo label="Échéance" valeur={forfait.echeance ? new Date(forfait.echeance).toLocaleDateString('fr-FR') : '—'} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Progression (cumul des forfaits)</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>
                      {Math.round(Math.min(100, (heuresConsommees / totalHeuresCumulees) * 100))} %
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={heuresConsommees}
                    aria-valuemin={0}
                    aria-valuemax={totalHeuresCumulees}
                    aria-label="Heures consommées sur l’ensemble des forfaits"
                    style={{ height: 10, borderRadius: 999, background: 'var(--fond-champ, rgba(0,0,0,.22))', overflow: 'hidden', display: 'flex' }}
                  >
                    <span
                      style={{
                        width: `${Math.min(100, (heuresConsommees / totalHeuresCumulees) * 100)}%`,
                        background: 'var(--accent-blue)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
                {editionForfaitOuverte && panneauForfaitEdition}
                {panneauDecisionEssai}
                {panneauAjoutForfait}
                {panneauDemandeForfait}
                <HistoriqueForfaits packages={packages} />
              </>
            )}
          </div>
        )}

        {ongletActif === 'planning' && forfait && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {panneauPlanification && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setPlanificationOuverte((v) => !v)} style={boutonPanneauStyle}>
                  {planificationOuverte ? 'Annuler' : seancesPlanifiees.length > 0 ? 'Modifier' : 'Planifier les séances'}
                </button>
              </div>
            )}

            {/* Lecture seule tant que l'admin n'a pas cliqué « Modifier » : le planning déjà
                généré (voir PlanifierSeancesForfait) se voit d'un coup d'œil plutôt que de
                rouvrir aveuglément un formulaire vierge qui écraserait le contexte déjà en
                place. */}
            {seancesPlanifiees.length > 0 && !planificationOuverte && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Planning prévisionnel · {seancesPlanifiees.length} séance{seancesPlanifiees.length > 1 ? 's' : ''}
                </span>
                <div style={{ opacity: 0.78, display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 12, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
                  <ListeRepliable visibles={4} nom="séances planifiées">
                    {seancesPlanifiees.map((s) => (
                      <div
                        key={s.enrollment.id}
                        onClick={peutModifierPlanning ? () => setSeanceEnEdition(s) : undefined}
                        className={peutModifierPlanning ? 'row-hl' : undefined}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: '9px 13px',
                          borderBottom: '1px solid var(--border-soft)',
                          cursor: peutModifierPlanning ? 'pointer' : 'default',
                        }}
                      >
                        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1 }}>
                          {new Date(s.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{s.session.duree_minutes} min</span>
                      </div>
                    ))}
                  </ListeRepliable>
                </div>
              </div>
            )}

            {seancesPlanifiees.length === 0 && !planificationOuverte && (
              <EtatVide
                compact
                icone="seances"
                titre="Aucune séance planifiée"
                description="Générez le planning prévisionnel du forfait pour que l’élève et son professeur voient leurs prochaines échéances."
              />
            )}

            {planificationOuverte && panneauPlanification?.(() => setPlanificationOuverte(false))}
          </div>
        )}
      </div>

      {historiqueNiveauOuvert && (
        <HistoriqueNiveauModale
          studentId={etudiant.id}
          etablissementId={etudiant.etablissement_id}
          diagnostic={diagnostic}
          peutModifier={peutModifierNiveau}
          onFermer={() => setHistoriqueNiveauOuvert(false)}
        />
      )}

      {seanceEnEdition && (
        <EditerSeancePlanifieeModale
          session={seanceEnEdition.session}
          /* Les DEUX membres d'un binôme, comme partout ailleurs (2026-10-11) : cet écran ne
             passait que l'élève dont on consulte le dossier, si bien qu'une séance de duo s'y
             annonçait « Élève : <un seul nom> » alors que les deux la suivent. */
          etudiants={duoPartenaire ? [etudiant, duoPartenaire] : [etudiant]}
          professeur={periodes.find((p) => p.seances.some((s) => s.session.id === seanceEnEdition.session.id))?.professeur}
          video={seanceEnEdition.video}
          onFermer={() => setSeanceEnEdition(null)}
          onEnregistre={() => {
            setSeanceEnEdition(null)
            onDossierChange?.()
          }}
        />
      )}

      {/* Fiche en lecture seule — toute séance qui n'est pas ouverte en édition ci-dessus
          (clôturée, annulée, reportée, collective, ou simplement en espace sans droit de
          modification) : date, durée, participants, compte rendu si la séance est terminée.
          Demande client du 2026-10-19 : une séance clôturée n'avait plus aucune ligne cliquable
          dans le parcours, donc plus aucun moyen d'y revenir voir ce qui s'est dit. */}
      {seanceEnDetail && (
        <DetailSeanceModale
          session={seanceEnDetail.session}
          professeur={periodes.find((p) => p.seances.some((s) => s.session.id === seanceEnDetail.session.id))?.professeur ?? null}
          eleves={duoPartenaire ? [etudiant, duoPartenaire] : [etudiant]}
          video={seanceEnDetail.video}
          onFermer={() => setSeanceEnDetail(null)}
        />
      )}
    </div>
  )
}
