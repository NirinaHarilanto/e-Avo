import { AdminLayout } from '../layout/AdminLayout'
import { useHeuresAdmin, type LigneHeures } from '../../hooks/useHeuresAdmin'
import { initiales } from '../etudiants/DossierEtudiantVue'

export function HeuresAdmin() {
  const { etudiants, professeurs, loading } = useHeuresAdmin()

  const totalConsommees = etudiants.reduce((total, l) => total + l.heures, 0)
  const totalEnseignees = professeurs.reduce((total, l) => total + l.heures, 0)

  return (
    <AdminLayout actif="Heures & forfaits">
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 22 }}>Heures & forfaits</h1>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="card" style={{ padding: '18px 20px' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Heures suivies (étudiants)</span>
              <div className="brand-font" style={{ fontSize: 30, color: 'var(--accent-gold, #e9cf94)', marginTop: 8 }}>
                {totalConsommees} h
              </div>
            </div>
            <div className="card" style={{ padding: '18px 20px' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Heures enseignées (professeurs)</span>
              <div className="brand-font" style={{ fontSize: 30, color: 'var(--accent-blue)', marginTop: 8 }}>
                {totalEnseignees} h
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' }}>
            <TableauHeures titre="Étudiants" lignes={etudiants} etiquette="h suivies" />
            <TableauHeures titre="Professeurs" lignes={professeurs} etiquette="h enseignées" />
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function TableauHeures({ titre, lignes, etiquette }: { titre: string; lignes: LigneHeures[]; etiquette: string }) {
  const triees = [...lignes].sort((a, b) => b.heures - a.heures)
  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 16, color: 'var(--accent-gold, #e9cf94)', marginBottom: 14 }}>{titre}</h2>
      {triees.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune donnée.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {triees.map(({ profile, heures }) => (
          <div key={profile.id} className="row-hl" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--border-soft)' }}>
            <span style={{ width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
              {initiales(profile)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1 }}>
              {profile.prenom} {profile.nom}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>
              {heures} {etiquette}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
