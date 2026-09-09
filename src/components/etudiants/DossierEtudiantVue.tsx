import type { ReactNode } from 'react'
import type { DossierEtudiant, PeriodeProfesseur } from '../../hooks/useDossierEtudiant'
import { getJoinUrl } from '../../lib/visio'
import type { Database } from '../../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

export function initiales(profile: Pick<Profile, 'nom' | 'prenom'>) {
  return `${(profile.prenom?.[0] ?? '').toUpperCase()}${(profile.nom?.[0] ?? '').toUpperCase()}`
}

function Tuile({ label, children, halo }: { label: string; children: ReactNode; halo?: string }) {
  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '18px 20px' }}>
      {halo && <span style={{ position: 'absolute', top: -30, right: -30, width: 150, height: 120, background: `radial-gradient(closest-side, ${halo}, transparent)` }} />}
      <span style={{ position: 'relative', fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      <div style={{ position: 'relative', marginTop: 8 }}>{children}</div>
    </div>
  )
}

function LigneInfo({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{valeur}</span>
    </div>
  )
}

function LigneDiagnostic({ diagnostic }: { diagnostic: NonNullable<DossierEtudiant['diagnostic']> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)', padding: '15px 18px' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderBottom: periode.seances.length ? '1px solid var(--border-soft)' : 'none' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1 }}>
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

      {periode.seances.map((seance) => (
        <div key={seance.enrollment.id} className="row-hl" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 18px', borderBottom: '1px solid var(--border-soft)' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', width: 90, flexShrink: 0 }}>
            {new Date(seance.session.debut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </span>
          <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1 }}>
            {seance.session.type === 'individuel' ? 'Séance individuelle' : 'Séance collective'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{seance.session.duree_minutes / 60} h</span>
          <StatutSeance enrollment={seance.enrollment} statutSession={seance.session.statut} />
        </div>
      ))}
    </div>
  )
}

interface DossierEtudiantVueProps {
  dossier: DossierEtudiant
  /* Blocs admin uniquement (attribuer un professeur, créer un forfait) — absents en vue élève. */
  panneauProfesseur?: ReactNode
  panneauForfait?: ReactNode
}

/* Rendu du dossier étudiant, partagé entre la vue admin (avec actions) et l'espace élève en
   lecture seule — même contenu, seuls les panneaux d'action admin diffèrent. */
export function DossierEtudiantVue({ dossier, panneauProfesseur, panneauForfait }: DossierEtudiantVueProps) {
  const { etudiant, periodes, diagnostic, packages, heuresConsommees, prochaineSeance } = dossier
  const forfait = packages[0] ?? null
  const seancesTerminees = periodes.flatMap((p) => p.seances).filter((s) => s.session.statut === 'terminee')
  const assiduite =
    seancesTerminees.length > 0
      ? Math.round((seancesTerminees.filter((s) => s.enrollment.present).length / seancesTerminees.length) * 100)
      : null
  const professeurActuel = periodes[0] && !periodes[0].affectation.date_fin ? periodes[0] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 54, height: 54, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
          {initiales(etudiant)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ fontSize: 24, color: '#fff' }}>
            {etudiant.prenom} {etudiant.nom}
          </h1>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <Tuile label="Heures suivies" halo="rgba(233,207,148,.2)">
          <span className="brand-font" style={{ fontSize: 26, color: 'var(--accent-gold, #e9cf94)' }}>
            {heuresConsommees}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}> h{forfait ? ` / ${forfait.total_heures} h` : ''}</span>
        </Tuile>
        <Tuile label="Assiduité" halo="rgba(111,227,192,.2)">
          <span className="brand-font" style={{ fontSize: 26, color: 'var(--accent-teal)' }}>
            {assiduite === null ? '—' : `${assiduite} %`}
          </span>
        </Tuile>
        <Tuile label="Prochaine séance" halo="rgba(94,179,255,.2)">
          {prochaineSeance ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="brand-font" style={{ fontSize: 18, color: 'var(--accent-cyan)' }}>
                {new Date(prochaineSeance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
              {prochaineSeance.video && (
                <a href={getJoinUrl(prochaineSeance.video)} target="_blank" rel="noreferrer" className="btn-shine btn-secondary" style={{ alignSelf: 'flex-start', fontSize: 11.5, padding: '7px 13px' }}>
                  Rejoindre
                </a>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Aucune planifiée</span>
          )}
        </Tuile>
        <Tuile label="Niveau évalué" halo="rgba(199,156,255,.2)">
          <span className="brand-font" style={{ fontSize: 26, color: 'var(--accent-violet)' }}>
            {diagnostic?.niveau_evalue ?? '—'}
          </span>
        </Tuile>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 18, alignItems: 'start' }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 20 }}>
            <h2 style={{ fontSize: 19, color: 'var(--accent-gold, #e9cf94)' }}>Parcours pédagogique</h2>
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {periodes.length} période{periodes.length > 1 ? 's' : ''} de suivi
              {periodes.length > 1 ? ` · ${periodes.length} professeurs depuis l'inscription` : ''}
            </p>
          </div>

          {periodes.length === 0 && diagnostic && <LigneDiagnostic diagnostic={diagnostic} />}
          {periodes.length === 0 && !diagnostic && <p style={{ color: 'var(--muted)' }}>Aucune séance enregistrée pour le moment.</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {periodes.map((periode, index) => (
              <BlocPeriode key={periode.affectation.id} periode={periode} estActuelle={index === 0 && !periode.affectation.date_fin} />
            ))}
            {diagnostic && periodes.length > 0 && <LigneDiagnostic diagnostic={diagnostic} />}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {professeurActuel && !panneauProfesseur && (
            <div className="card" style={{ padding: '20px 22px' }}>
              <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)', marginBottom: 14 }}>Professeur actuel</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ width: 46, height: 46, borderRadius: 15, background: 'var(--accent-blue-gradient)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                  {professeurActuel.professeur ? initiales(professeurActuel.professeur) : '?'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
                    {professeurActuel.professeur ? `${professeurActuel.professeur.prenom} ${professeurActuel.professeur.nom}` : 'Professeur'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{professeurActuel.affectation.langue}</span>
                </div>
              </div>
            </div>
          )}

          {panneauProfesseur && professeurActuel && (
            <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>Professeur actuel</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ width: 46, height: 46, borderRadius: 15, background: 'var(--accent-blue-gradient)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                  {professeurActuel.professeur ? initiales(professeurActuel.professeur) : '?'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
                    {professeurActuel.professeur ? `${professeurActuel.professeur.prenom} ${professeurActuel.professeur.nom}` : 'Professeur'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{professeurActuel.affectation.langue}</span>
                </div>
              </div>
              {panneauProfesseur}
            </div>
          )}
          {panneauProfesseur && !professeurActuel && panneauProfesseur}

          {diagnostic && (
            <div className="card" style={{ padding: '20px 22px' }}>
              <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)', marginBottom: 14 }}>Appel diagnostic</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <LigneInfo label="Date" valeur={new Date(diagnostic.date_appel).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} />
                <LigneInfo label="Niveau évalué" valeur={diagnostic.niveau_evalue ?? '—'} />
                <LigneInfo label="Rythme convenu" valeur={diagnostic.rythme_convenu ?? '—'} />
              </div>
              {diagnostic.notes && (
                <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)', background: 'rgba(0,0,0,.24)', borderRadius: 12, padding: '11px 13px', marginTop: 14 }}>
                  « {diagnostic.notes} »
                </p>
              )}
            </div>
          )}

          {!forfait && panneauForfait}

          {forfait && (
            <div className="card" style={{ padding: '20px 22px' }}>
              <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)', marginBottom: 14 }}>Forfait en cours</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <LigneInfo label="Formule" valeur={`${forfait.total_heures} h`} />
                <LigneInfo label="Consommées" valeur={`${heuresConsommees} h`} />
                <LigneInfo label="Échéance" valeur={forfait.echeance ? new Date(forfait.echeance).toLocaleDateString('fr-FR') : '—'} />
              </div>
              <div style={{ height: 10, borderRadius: 999, background: 'rgba(0,0,0,.3)', overflow: 'hidden', display: 'flex', marginTop: 14 }}>
                <span
                  style={{
                    width: `${Math.min(100, (heuresConsommees / forfait.total_heures) * 100)}%`,
                    background: 'linear-gradient(90deg,#5eb3ff,#e9cf94)',
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
