import { useProfileContext } from '../../context/ProfileContext'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { DossierEtudiantVue } from './DossierEtudiantVue'
import { EtudiantLayout } from '../layout/EtudiantLayout'

export function MonEspaceEtudiant() {
  const { profile } = useProfileContext()
  const { dossier, loading, erreur } = useDossierEtudiant(profile?.id)

  return (
    <EtudiantLayout actif="Mon dossier">
      {profile && (
        <div
          className="card"
          style={{
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            border: '1px solid var(--border)',
            background: 'rgba(233,207,148,.08)',
          }}
        >
          <span style={{ fontSize: 20 }} aria-hidden>
            👋
          </span>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)' }}>
            Bienvenue {profile.prenom} ! Heureux de vous compter parmi nos étudiants — vous
            retrouverez ici votre dossier, vos documents et votre compteur d'heures.
          </p>
        </div>
      )}
      {loading && <p style={{ color: 'var(--muted)' }}>Chargement de votre espace…</p>}
      {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}
      {dossier && <DossierEtudiantVue dossier={dossier} />}
    </EtudiantLayout>
  )
}
