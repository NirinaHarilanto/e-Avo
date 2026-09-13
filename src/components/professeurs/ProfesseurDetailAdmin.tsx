import { useNavigate, useParams } from 'react-router-dom'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfesseurDetailAdmin, type EleveDuProfesseur } from '../../hooks/useProfesseurDetailAdmin'
import { InformationsPersonnelles } from '../shared/InformationsPersonnelles'
import { initiales } from '../etudiants/DossierEtudiantVue'

export function ProfesseurDetailAdmin() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { detail, loading, erreur, recharger } = useProfesseurDetailAdmin(id)

  return (
    <AdminLayout actif="Professeurs">
      <button
        onClick={() => navigate('/admin/professeurs')}
        style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 16 }}
      >
        ← Tous les professeurs
      </button>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : erreur || !detail ? (
        <p style={{ color: 'var(--danger)' }}>{erreur ?? 'Professeur introuvable.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ width: 54, height: 54, borderRadius: 999, background: 'var(--accent-blue-gradient)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
              {initiales(detail.professeur)}
            </span>
            <div>
              <h1 style={{ fontSize: 24, color: '#fff' }}>
                {detail.professeur.prenom} {detail.professeur.nom}
              </h1>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{detail.professeur.email}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div className="card" style={{ padding: '18px 20px' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Élèves actifs</span>
              <div className="brand-font" style={{ fontSize: 28, color: 'var(--accent-blue)', marginTop: 6 }}>
                {detail.eleves.length}
              </div>
            </div>
            <div className="card" style={{ padding: '18px 20px' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Heures enseignées (total)</span>
              <div className="brand-font" style={{ fontSize: 28, color: 'var(--accent-gold, #e9cf94)', marginTop: 6 }}>
                {detail.heuresTotalEnseignees} h
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 18, alignItems: 'start' }}>
            <div className="card" style={{ padding: 24 }}>
              <h2 style={{ fontSize: 19, color: 'var(--accent-gold, #e9cf94)', marginBottom: 16 }}>Élèves attribués</h2>
              {detail.eleves.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>Aucun élève actif attribué à ce professeur.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {detail.eleves.map((e) => (
                    <LigneEleve key={e.eleve.id} eleveDuProfesseur={e} />
                  ))}
                </div>
              )}
            </div>

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
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>{heuresEnseignees} h enseignées</span>
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
