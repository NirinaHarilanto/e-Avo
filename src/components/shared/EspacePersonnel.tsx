import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { MonEspaceEtudiant } from '../etudiants/MonEspaceEtudiant'
import { CalendrierProfesseur } from '../professeurs/CalendrierProfesseur'

/* Point d'entrée /mon-espace : redirige vers le bon espace selon le rôle du profil connecté. */
export function EspacePersonnel() {
  const { session, profile, loading } = useProfileContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!session) navigate('/connexion', { replace: true })
  }, [session, loading, navigate])

  if (loading || !profile) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Chargement…
      </div>
    )
  }

  if (profile.role === 'professeur') {
    return <CalendrierProfesseur />
  }

  return <MonEspaceEtudiant />
}
