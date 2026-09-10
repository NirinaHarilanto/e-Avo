import { useProfileContext } from '../../context/ProfileContext'
import { useDocuments } from '../../hooks/useDocuments'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { UploaderDocument } from '../documents/UploaderDocument'
import { ListeDocuments } from '../documents/ListeDocuments'

export function DocumentsEtudiant() {
  const { profile } = useProfileContext()
  const { documents, loading, erreur, recharger } = useDocuments(profile?.id)

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
        <div className="card" style={{ padding: 20 }}>
          <ListeDocuments documents={documents} peutSupprimer={(d) => d.uploaded_by_profile_id === profile?.id} onChange={recharger} />
        </div>
      )}
    </EtudiantLayout>
  )
}
