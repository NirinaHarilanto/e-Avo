import { useState, type ReactNode } from 'react'
import type { DossierEtudiant, PeriodeProfesseur } from '../../hooks/useDossierEtudiant'
import { getJoinUrl } from '../../lib/visio'
import type { Database } from '../../types/database.types'
import { GrilleStats, Stat } from '../ui/Stat'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { LigneInfo } from '../ui/Champ'

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

function LigneDiagnostic({ diagnostic }: { diagnostic: NonNullable<DossierEtudiant['diagnostic']> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)', padding: '15px 18px' }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-2)', flexGrow: 1 }}>
        Appel diagnostic réalisé{diagnostic.niveau_evalue ? ` · niveau initial ${diagnostic.niveau_evalue}` : ''}
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>{new Date(diagnostic.date_appel).toLocaleDateString('fr-FR')}</span>
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

function BlocPeriode({ periode, estActuelle }: { periode: PeriodeProfesseur; estActuelle: boolean }) {
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
        <div role="table" aria-label="Séances de la période">
          <div
            role="row"
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 18px', background: 'rgba(0,0,0,.18)', borderBottom: '1px solid var(--border-soft)' }}
          >
            <span role="columnheader" style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, width: 90, flexShrink: 0 }}>
              Date
            </span>
            <span role="columnheader" style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, flexGrow: 1 }}>
              Séance
            </span>
            <span role="columnheader" style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Durée
            </span>
            <span role="columnheader" style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, width: 72, textAlign: 'right' }}>
              Présence
            </span>
          </div>
          {periode.seances.map((seance) => (
            <div key={seance.enrollment.id} role="row" className="row-hl" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 18px', borderBottom: '1px solid var(--border-soft)' }}>
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
          ))}
        </div>
      )}
    </div>
  )
}

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
  /* Formulaire de planning prévisionnel (individuel/duo), replié derrière un bouton dédié. */
  panneauPlanification?: ReactNode
  /* Formulaire d'assignation/changement de vague pour le programme collectif. */
  panneauVague?: ReactNode
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
}: DossierEtudiantVueProps) {
  const { etudiant, periodes, diagnostic, packages, cohorte, heuresConsommees, prochaineSeance } = dossier
  const forfait = packages[0] ?? null
  const [editionForfaitOuverte, setEditionForfaitOuverte] = useState(false)
  const [planificationOuverte, setPlanificationOuverte] = useState(false)
  const [editionVagueOuverte, setEditionVagueOuverte] = useState(false)
  const seancesTerminees = periodes.flatMap((p) => p.seances).filter((s) => s.session.statut === 'terminee')
  const assiduite =
    seancesTerminees.length > 0
      ? Math.round((seancesTerminees.filter((s) => s.enrollment.present).length / seancesTerminees.length) * 100)
      : null
  const professeurActuel = periodes[0] && !periodes[0].affectation.date_fin ? periodes[0] : null

  // La colonne latérale pouvait se retrouver totalement vide sur un dossier qui vient d'être
  // créé (ni professeur, ni diagnostic, ni programme) en laissant une gouttière de 320 px sans
  // rien dedans, et sans dire à l'utilisateur ce qu'il lui restait à faire.
  const colonneLateraleVide =
    !panneauInformations && !professeurActuel && !panneauProfesseur && !diagnostic && !cohorte && !forfait && !panneauChoixInitial

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
            {periodes[0]?.affectation.langue && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-violet)', background: 'rgba(199,156,255,.12)', border: '1px solid rgba(199,156,255,.3)', borderRadius: 999, padding: '4px 11px' }}>
                {periodes[0].affectation.langue}
              </span>
            )}
            {etudiant.email && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{etudiant.email}</span>}
          </div>
        </div>
      </div>

      <GrilleStats min={180}>
        <Stat
          libelle="Heures suivies"
          valeur={heuresConsommees}
          unite={forfait ? `h / ${forfait.total_heures} h` : 'h'}
          ton="or"
          aide={forfait ? `Forfait de ${forfait.total_heures} h` : 'Aucun forfait rattaché'}
        />
        <Stat
          libelle="Assiduité"
          valeur={assiduite === null ? '—' : `${assiduite} %`}
          ton="teal"
          aide={seancesTerminees.length > 0 ? `Sur ${seancesTerminees.length} séance${seancesTerminees.length > 1 ? 's' : ''} clôturée${seancesTerminees.length > 1 ? 's' : ''}` : 'Aucune séance clôturée'}
        />
        <Stat
          libelle="Prochaine séance"
          valeur={
            prochaineSeance ? (
              <span style={{ fontSize: 17 }}>
                {new Date(prochaineSeance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            ) : (
              <span style={{ fontSize: 17 }}>Aucune planifiée</span>
            )
          }
          ton="bleu"
          pied={
            prochaineSeance?.video ? (
              <a href={getJoinUrl(prochaineSeance.video)} target="_blank" rel="noreferrer" className="btn-shine btn-secondary" style={{ fontSize: 11.5, padding: '7px 13px' }}>
                Rejoindre la visio
              </a>
            ) : undefined
          }
        />
        <Stat libelle="Niveau évalué" valeur={diagnostic?.niveau_evalue ?? '—'} ton="violet" aide={diagnostic ? 'Établi lors de l’appel diagnostic' : 'Pas encore de diagnostic'} />
      </GrilleStats>

      <div className="grille-dossier">
        <Section
          titre="Parcours pédagogique"
          description={
            periodes.length > 0
              ? `${periodes.length} période${periodes.length > 1 ? 's' : ''} de suivi${periodes.length > 1 ? ` · ${periodes.length} professeurs depuis l’inscription` : ''}. Chaque période liste les séances du professeur concerné.`
              : undefined
          }
          padding={22}
        >
          {periodes.length === 0 && diagnostic && <LigneDiagnostic diagnostic={diagnostic} />}
          {periodes.length === 0 && !diagnostic && (
            <EtatVide
              icone="seances"
              titre="Aucune séance enregistrée"
              description="Le parcours se remplit automatiquement dès qu’un professeur est attribué et que ses séances sont planifiées puis clôturées."
            />
          )}

          {periodes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {periodes.map((periode, index) => (
                <BlocPeriode key={periode.affectation.id} periode={periode} estActuelle={index === 0 && !periode.affectation.date_fin} />
              ))}
              {diagnostic && <LigneDiagnostic diagnostic={diagnostic} />}
            </div>
          )}
        </Section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {panneauInformations}

          {/* Une seule carte « Professeur actuel » : la version lecture seule et la version avec
              actions étaient auparavant deux blocs jumeaux de 16 lignes, à maintenir en double. */}
          {professeurActuel && (
            <Section titre="Professeur actuel" padding="18px 20px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <IdentiteProfesseur periode={professeurActuel} />
                {panneauProfesseur}
              </div>
            </Section>
          )}
          {panneauProfesseur && !professeurActuel && panneauProfesseur}

          {diagnostic && (
            <Section titre="Appel diagnostic" padding="18px 20px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <LigneInfo label="Date" valeur={new Date(diagnostic.date_appel).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} />
                <LigneInfo label="Niveau évalué" valeur={diagnostic.niveau_evalue ?? '—'} />
                <LigneInfo label="Rythme convenu" valeur={diagnostic.rythme_convenu ?? '—'} />
              </div>
              {diagnostic.notes && (
                <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)', background: 'rgba(0,0,0,.24)', borderRadius: 12, padding: '11px 13px', margin: '14px 0 0' }}>
                  « {diagnostic.notes} »
                </p>
              )}
            </Section>
          )}

          {!forfait && !cohorte && panneauChoixInitial}

          {cohorte && (
            <Section
              titre="Programme collectif"
              padding="18px 20px"
              actions={
                panneauVague ? (
                  <button onClick={() => setEditionVagueOuverte((v) => !v)} style={boutonPanneauStyle}>
                    {editionVagueOuverte ? 'Annuler' : 'Changer'}
                  </button>
                ) : undefined
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <LigneInfo label="Vague" valeur={cohorte.nom} />
                <LigneInfo label="Langue" valeur={cohorte.langue ?? '—'} />
                <LigneInfo
                  label="Dates"
                  valeur={`${new Date(cohorte.date_debut).toLocaleDateString('fr-FR')} → ${new Date(cohorte.date_fin).toLocaleDateString('fr-FR')}`}
                />
              </div>
              {editionVagueOuverte && <div style={{ marginTop: 14 }}>{panneauVague}</div>}
            </Section>
          )}

          {!cohorte && forfait && (
            <Section
              titre="Forfait en cours"
              padding="18px 20px"
              actions={
                <>
                  {panneauPlanification && (
                    <button onClick={() => setPlanificationOuverte((v) => !v)} style={boutonPanneauStyle}>
                      {planificationOuverte ? 'Annuler' : 'Planifier les séances'}
                    </button>
                  )}
                  {panneauForfaitEdition && (
                    <button onClick={() => setEditionForfaitOuverte((v) => !v)} style={boutonPanneauStyle}>
                      {editionForfaitOuverte ? 'Annuler' : 'Modifier'}
                    </button>
                  )}
                </>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <LigneInfo label="Programme" valeur={forfait.type_programme === 'duo' ? 'Duo' : 'Individuel'} />
                <LigneInfo label="Formule" valeur={`${forfait.total_heures} h`} />
                <LigneInfo label="Consommées" valeur={`${heuresConsommees} h`} />
                <LigneInfo label="Restantes" valeur={`${Math.max(0, forfait.total_heures - heuresConsommees)} h`} />
                <LigneInfo label="Échéance" valeur={forfait.echeance ? new Date(forfait.echeance).toLocaleDateString('fr-FR') : '—'} />
              </div>
              <div style={{ marginTop: 14 }}>
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
              {editionForfaitOuverte && <div style={{ marginTop: 14 }}>{panneauForfaitEdition}</div>}
              {planificationOuverte && <div style={{ marginTop: 14 }}>{panneauPlanification}</div>}
            </Section>
          )}

          {colonneLateraleVide && (
            <EtatVide
              compact
              icone="dossier"
              titre="Dossier à compléter"
              description="Ce dossier n’a encore ni professeur, ni programme, ni appel diagnostic. Un administrateur doit attribuer un professeur puis choisir un programme pour que le suivi démarre."
            />
          )}
        </div>
      </div>
    </div>
  )
}
