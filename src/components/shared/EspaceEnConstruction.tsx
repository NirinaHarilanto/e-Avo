import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { MonEspaceEtudiant } from '../etudiants/MonEspaceEtudiant'
import { Logo } from './Logo'

/* Espace professeur — le calendrier professeur et les séances arrivent en Phase 4
   (Planning). L'espace élève, lui, est déjà un vrai dossier (voir MonEspaceEtudiant). */
export function EspaceEnConstruction() {
  const { session, profile, loading, seDeconnecter } = useProfileContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!session) navigate('/connexion', { replace: true })
  }, [session, loading, navigate])

  if (profile?.role === 'etudiant') {
    return <MonEspaceEtudiant />
  }

  if (loading || !profile) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Chargement…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24, textAlign: 'center' }}>
      <Logo />
      <h1 style={{ fontSize: 24, color: 'var(--ink)' }}>Bonjour {profile.prenom ?? ''}</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 420 }}>
        Votre espace professeur (calendrier, séances et heures enseignées) arrive dans la prochaine phase de
        construction.
      </p>
      <button onClick={() => seDeconnecter()} className="btn-shine" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}>
        Déconnexion
      </button>
    </div>
  )
}
