import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { MonEspaceEtudiant } from '../etudiants/MonEspaceEtudiant'

/* Point d'entrée /mon-espace : redirige vers le bon espace selon le rôle du profil connecté.
   L'espace professeur est désormais multi-pages (calendrier/étudiants/heures, voir
   ProfesseurLayout) — on redirige donc vers sa route plutôt que de le rendre directement. */
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
    return <Navigate to="/professeur/calendrier" replace />
  }
  if (profile.role === 'admin_etablissement') {
    return <Navigate to="/admin/prospects" replace />
  }

  return <MonEspaceEtudiant />
}
