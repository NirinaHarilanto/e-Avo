import { useProfileContext } from '../../context/ProfileContext'
import { useDocuments } from '../../hooks/useDocuments'
import { useSessionReports } from '../../hooks/useSessionReports'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { UploaderDocument } from '../documents/UploaderDocument'
import { ListeDocuments } from '../documents/ListeDocuments'

export function DocumentsEtudiant() {
  const { profile } = useProfileContext()
  const { documents, loading, erreur, recharger } = useDocuments(profile?.id)
  const { comptesRendus, loading: chargementComptesRendus } = useSessionReports()

  return (
    <EtudiantLayout actif="Mes documents">
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 22 }}>Mes documents</h1>

      {profile && (
        <div style={{ marginBottom: 20 }}>
          <UploaderDocument ownerProfileId={profile.id} etablissementId={profile.etablissement_id} onUploade={recharger} />
        </div>
      )}

      {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <ListeDocuments documents={documents} peutSupprimer={(d) => d.uploaded_by_profile_id === profile?.id} onChange={recharger} />
        </div>
      )}

      <h2 style={{ fontSize: 19, color: 'var(--accent-gold, #e9cf94)', marginBottom: 14 }}>Comptes rendus de mes cours</h2>
      {chargementComptesRendus ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : comptesRendus.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Aucun compte rendu pour le moment.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comptesRendus.map(({ rapport, session, professeur }) => (
            <div key={rapport.id} className="card card-lift" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span className="brand-font" style={{ fontSize: 13.5, color: 'var(--ink)' }}>
                  {session ? new Date(session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Séance'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{professeur ? `${professeur.prenom} ${professeur.nom}` : ''}</span>
              </div>
              {rapport.themes && (
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>
                  <strong>Thèmes :</strong> {rapport.themes}
                </p>
              )}
              {rapport.resume && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>{rapport.resume}</p>}
            </div>
          ))}
        </div>
      )}
    </EtudiantLayout>
  )
}
