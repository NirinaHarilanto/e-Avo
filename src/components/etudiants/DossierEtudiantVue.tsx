import { useState, type ReactNode } from 'react'
import type { DossierEtudiant, PeriodeProfesseur, SeanceDuParcours } from '../../hooks/useDossierEtudiant'
import { useNiveauxEtudiant } from '../../hooks/useNiveauxEtudiant'
import { getJoinUrl } from '../../lib/visio'
import { estRempli } from '../../lib/diagnostic'
import { RecapitulatifDiagnostic } from '../prospects/FormulaireDiagnosticCall'
import type { Database } from '../../types/database.types'
import { GrilleStats, Stat } from '../ui/Stat'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { LigneInfo } from '../ui/Champ'
import { Icone } from '../ui/Icones'
import { Onglets, type Onglet } from '../ui/Onglets'
import { ListeRepliable, TexteRepliable } from '../ui/Repliable'
import { HistoriqueNiveauModale } from './HistoriqueNiveauModale'
import { EditerSeancePlanifieeModale } from '../shared/EditerSeancePlanifieeModale'

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)', padding: '15px 18px' }}>
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
        <div style={{ background: 'rgba(0,0,0,.24)', borderRadius: 12, padding: '11px 13px' }}>
          <TexteRepliable texte={`« ${diagnostic.notes} »`} style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)' }} />
        </div>
      )}
      {/* Réponses à la trame remplie pendant l'appel (0050) : elles suivent le prospect dans son
          dossier d'élève, ce qui est précisément ce que la demande client appelle « enregistrer
          les résultats dans les informations des étudiants ». */}
      {estRempli(diagnostic.reponses ?? {}) && (
        <div style={{ background: 'rgba(0,0,0,.24)', borderRadius: 12, padding: '13px 15px' }}>
          <RecapitulatifDiagnostic reponses={diagnostic.reponses} />
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
                {p.type_programme === 'duo' ? 'Duo' : 'Individuel'} · {p.total_heures} h
                {p.essai && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', background: 'rgba(233,207,148,.14)', border: '1px solid rgba(233,207,148,.32)', borderRadius: 999, padding: '2px 7px' }}>
                    Essai {p.essai_resultat === 'poursuivi' ? '· poursuivi' : p.essai_resultat === 'arrete' ? '· arrêté' : ''}
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
          color: fait ? '#0a1530' : 'var(--muted-2)',
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
          {periode.professeur ? `${periode.professeur.prenom} ${periode.professeur.nom}` : 'Professeur'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{periode.affectation.langue ?? 'Langue non précisée'}</span>
      </div>
    </div>
  )
}

function BlocPeriode({
  periode,
  estActuelle,
  onModifierSeance,
}: {
  periode: PeriodeProfesseur
  estActuelle: boolean
  /* Absent en lecture seule (élève/professeur) ; sinon, cliquer une séance encore planifiée
     ouvre le même pop-up de reprogrammation que l'onglet Forfait & Planning — même interaction,
     deux points d'entrée. */
  onModifierSeance?: (seance: SeanceDuParcours) => void
}) {
  const heures = periode.seances.reduce((total, s) => total + s.session.duree_minutes / 60, 0)
  return (
    <div
      style={{
        borderRadius: 16,
        border: estActuelle ? '1px solid rgba(94,179,255,.3)' : '1px solid var(--border)',
        background: estActuelle ? 'linear-gradient(160deg, rgba(20,42,84,.6), rgba(10,22,48,.7))' : 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 18px', borderBottom: periode.seances.length ? '1px solid var(--border-soft)' : 'none' }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: estActuelle ? 'var(--accent-blue-gradient)' : 'rgba(255,255,255,.06)',
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
              {periode.professeur ? `${periode.professeur.prenom} ${periode.professeur.nom}` : 'Professeur'}
            </span>
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
              {heures} h
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
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 18px', background: 'rgba(0,0,0,.18)', borderBottom: '1px solid var(--border-soft)' }}
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
            const modifiable = !!onModifierSeance && seance.session.statut === 'planifiee'
            return (
              <div
                key={seance.enrollment.id}
                className="row-hl"
                onClick={modifiable ? () => onModifierSeance(seance) : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 18px', borderBottom: '1px solid var(--border-soft)', cursor: modifiable ? 'pointer' : 'default' }}
              >
                <span style={{ fontSize: 12, color: 'var(--muted)', width: 90, flexShrink: 0 }}>
                  {new Date(seance.session.debut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1 }}>
                  {seance.session.type === 'individuel' ? 'Séance individuelle' : 'Séance collective'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{seance.session.duree_minutes / 60} h</span>
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

type OngletDossier = 'parcours' | 'informations' | 'professeur' | 'programme' | 'planning'

interface DossierEtudiantVueProps {
  dossier: DossierEtudiant
  /* Blocs admin uniquement — absents en vue élève/professeur. */
  panneauProfesseur?: ReactNode
  panneauInformations?: ReactNode
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
  /* Bouton + pop-up de suppression du compte — admin uniquement, comme les autres panneaux. */
  panneauSuppression?: ReactNode
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
}

/* Rendu du dossier étudiant, partagé entre la vue admin (avec actions) et l'espace élève/
   professeur en lecture seule — même contenu, seuls les panneaux d'action admin diffèrent. */
export function DossierEtudiantVue({
  dossier,
  panneauProfesseur,
  panneauInformations,
  panneauChoixInitial,
  panneauForfaitEdition,
  panneauPlanification,
  panneauVague,
  panneauDecisionEssai,
  panneauSuppression,
  peutModifierNiveau,
  peutModifierPlanning,
  onDossierChange,
}: DossierEtudiantVueProps) {
  const { etudiant, periodes, periodeActuelle, diagnostic, packages, cohorte, heuresConsommees, prochaineSeance, tarifChoisi } = dossier
  const forfait = packages[0] ?? null
  const [editionForfaitOuverte, setEditionForfaitOuverte] = useState(false)
  const [planificationOuverte, setPlanificationOuverte] = useState(false)
  const [editionVagueOuverte, setEditionVagueOuverte] = useState(false)
  const [historiqueNiveauOuvert, setHistoriqueNiveauOuvert] = useState(false)
  const [seanceEnEdition, setSeanceEnEdition] = useState<SeanceDuParcours | null>(null)
  const [ongletDemande, setOngletDemande] = useState<OngletDossier>('parcours')
  const { evaluations: niveaux } = useNiveauxEtudiant(etudiant.id)
  const niveauActuel = niveaux[niveaux.length - 1]?.niveau ?? diagnostic?.niveau_evalue ?? null
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
          <span style={{ width: 54, height: 54, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
            {initiales(etudiant)}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h2 style={{ fontSize: 22, color: '#fff', margin: 0 }}>
              {etudiant.prenom} {etudiant.nom}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-teal)', background: 'rgba(111,227,192,.14)', border: '1px solid rgba(111,227,192,.32)', borderRadius: 999, padding: '4px 11px' }}>
                {etudiant.status === 'approved' ? 'Étudiant actif' : etudiant.status}
              </span>
              {(periodeActuelle ?? periodes[0])?.affectation.langue && (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-violet)', background: 'rgba(199,156,255,.12)', border: '1px solid rgba(199,156,255,.3)', borderRadius: 999, padding: '4px 11px' }}>
                  {(periodeActuelle ?? periodes[0]).affectation.langue}
                </span>
              )}
              {etudiant.email && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{etudiant.email}</span>}
            </div>
          </div>
        </div>
        {panneauSuppression}
      </div>

      <GrilleStats min={160} compact>
        <Stat
          compact
          libelle="Heures suivies"
          valeur={heuresConsommees}
          unite={forfait ? `h / ${forfait.total_heures} h` : 'h'}
          ton="or"
          aide={forfait ? `Forfait de ${forfait.total_heures} h` : 'Aucun forfait rattaché'}
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
          valeur={niveauActuel ?? '—'}
          ton="violet"
          aide={diagnostic || niveaux.length > 0 ? 'Établi lors de l’appel diagnostic' : 'Pas encore de diagnostic'}
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
        <Onglets etiquette="Sections du dossier" actif={ongletActif} onChange={setOngletDemande} onglets={onglets} compact />

        {ongletActif === 'parcours' && (
          <div>
            {periodes.length > 0 && (
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                {periodes.length} période{periodes.length > 1 ? 's' : ''} de suivi
                {periodes.length > 1 ? ` · ${periodes.length} professeurs depuis l’inscription` : ''}. Chaque période liste
                les séances du professeur concerné.
              </p>
            )}
            {periodes.length === 0 && diagnostic && <BlocDiagnostic diagnostic={diagnostic} tarifChoisi={cohorte ? tarifChoisi : null} />}
            {periodes.length === 0 && !diagnostic && (
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
                    onModifierSeance={peutModifierPlanning ? setSeanceEnEdition : undefined}
                  />
                ))}
                {diagnostic && <BlocDiagnostic diagnostic={diagnostic} tarifChoisi={cohorte ? tarifChoisi : null} />}
              </div>
            )}
          </div>
        )}

        {ongletActif === 'informations' && panneauInformations}

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
                  <LigneInfo label="Programme" valeur={forfait.type_programme === 'duo' ? 'Duo' : 'Individuel'} />
                  <LigneInfo label="Formule" valeur={`${forfait.total_heures} h`} />
                  <LigneInfo label="Montant" valeur={forfait.montant !== null ? `${forfait.montant.toLocaleString('fr-FR')} Ar` : '—'} />
                  <LigneInfo label="Consommées" valeur={`${heuresConsommees} h`} />
                  <LigneInfo label="Restantes" valeur={`${Math.max(0, forfait.total_heures - heuresConsommees)} h`} />
                  <LigneInfo label="Échéance" valeur={forfait.echeance ? new Date(forfait.echeance).toLocaleDateString('fr-FR') : '—'} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Progression du forfait</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>
                      {Math.round(Math.min(100, (heuresConsommees / forfait.total_heures) * 100))} %
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={heuresConsommees}
                    aria-valuemin={0}
                    aria-valuemax={forfait.total_heures}
                    aria-label="Heures consommées sur le forfait"
                    style={{ height: 10, borderRadius: 999, background: 'rgba(0,0,0,.3)', overflow: 'hidden', display: 'flex' }}
                  >
                    <span
                      style={{
                        width: `${Math.min(100, (heuresConsommees / forfait.total_heures) * 100)}%`,
                        background: 'linear-gradient(90deg,#5eb3ff,#e9cf94)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
                {editionForfaitOuverte && panneauForfaitEdition}
                {panneauDecisionEssai}
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
          etudiants={[etudiant]}
          professeur={periodes.find((p) => p.seances.some((s) => s.session.id === seanceEnEdition.session.id))?.professeur}
          video={seanceEnEdition.video}
          onFermer={() => setSeanceEnEdition(null)}
          onEnregistre={() => {
            setSeanceEnEdition(null)
            onDossierChange?.()
          }}
        />
      )}
    </div>
  )
}
