import { useProfileContext } from '../../context/ProfileContext'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { DossierEtudiantVue } from './DossierEtudiantVue'
import { Logo } from '../shared/Logo'

export function MonEspaceEtudiant() {
  const { profile, seDeconnecter } = useProfileContext()
  const { dossier, loading, erreur } = useDossierEtudiant(profile?.id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: '1px solid var(--border-soft)' }}>
        <Logo size={24} />
        <button
          onClick={() => seDeconnecter()}
          style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}
        >
          Déconnexion
        </button>
      </header>
      <div style={{ padding: '28px 32px 48px', maxWidth: 1200, margin: '0 auto' }}>
        {loading && <p style={{ color: 'var(--muted)' }}>Chargement de votre espace…</p>}
        {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}
        {dossier && <DossierEtudiantVue dossier={dossier} />}
      </div>
    </div>
  )
}
