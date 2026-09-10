import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin'
import { MonEspaceEtudiant } from '../etudiants/MonEspaceEtudiant'
import { ChoixEspace } from './ChoixEspace'

/* Point d'entrée /mon-espace : redirige vers le bon espace selon le rôle du profil connecté.
   L'espace professeur est désormais multi-pages (calendrier/étudiants/heures, voir
   ProfesseurLayout) — on redirige donc vers sa route plutôt que de le rendre directement.
   L'administrateur plateforme (seul compte à cumuler les 3 espaces, voir migration 0023) voit
   d'abord un choix explicite plutôt que d'atterrir directement sur l'espace élève — son
   profil.role reste 'etudiant', ce qui déclencherait sinon systématiquement ce cas par défaut. */
export function EspacePersonnel() {
  const { session, profile, loading: profileLoading } = useProfileContext()
  const { platformAdmin, loading: platformLoading } = usePlatformAdmin(session, profileLoading)
  const loading = profileLoading || platformLoading
  const navigate = useNavigate()
  const [espaceEtudiantChoisi, setEspaceEtudiantChoisi] = useState(false)

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

  if (platformAdmin && !espaceEtudiantChoisi) {
    return <ChoixEspace onChoisirEtudiant={() => setEspaceEtudiantChoisi(true)} />
  }

  if (profile.role === 'professeur') {
    return <Navigate to="/professeur/calendrier" replace />
  }
  if (profile.role === 'admin_etablissement') {
    return <Navigate to="/admin/prospects" replace />
  }

  return <MonEspaceEtudiant />
}
