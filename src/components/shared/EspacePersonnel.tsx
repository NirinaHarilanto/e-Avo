import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { MonEspaceEtudiant } from '../etudiants/MonEspaceEtudiant'
import { ChoixEspace } from './ChoixEspace'

/* Point d'entrée /mon-espace : redirige vers le bon espace selon le rôle du profil connecté.
   L'espace professeur est désormais multi-pages (calendrier/étudiants/heures, voir
   ProfesseurLayout) — on redirige donc vers sa route plutôt que de le rendre directement.
   L'administrateur plateforme (seul compte à cumuler les 3 espaces, voir migration 0023) voit
   d'abord un choix explicite plutôt que d'atterrir directement sur un espace par défaut. Une
   fois ce choix fait, il doit rester prioritaire sur `profile.role` : ce rôle unique peut valoir
   n'importe laquelle des 3 valeurs selon les besoins du moment (ex. passé à 'professeur' le
   2026-09-14 pour apparaître dans la liste des professeurs assignables) sans que ça retire
   l'accès aux 2 autres espaces. Avant ce correctif, choisir "Espace élève" alors que le rôle
   valait déjà 'professeur' retombait silencieusement sur `/professeur/calendrier` : le
   `if (platformAdmin && ...)` suivant doit donc couvrir les deux issues du choix, pas seulement
   l'ouverture de `ChoixEspace`. */
export function EspacePersonnel() {
  const { session, profile, loading: profileLoading, platformAdmin, platformAdminLoading } = useProfileContext()
  const loading = profileLoading || platformAdminLoading
  const navigate = useNavigate()
  const [espaceEtudiantChoisi, setEspaceEtudiantChoisi] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!session) navigate('/connexion', { replace: true })
  }, [session, loading, navigate])

  /* `platformAdminLoading` fait partie de la condition, sinon course perdue d'avance : le profil
     arrive avant le statut d'admin plateforme (deux requêtes distinctes), et cette fonction
     tranchait alors sur le seul `profile.role` — un admin plateforme dont le rôle vaut
     'professeur' était redirigé vers /professeur/calendrier une fraction de seconde avant que son
     statut n'arrive, donc ne voyait jamais l'écran de choix des 3 espaces. `profileLoading` reste
     volontairement hors de la condition (voir EspaceLayout.tsx) : un rafraîchissement de fond ne
     doit pas vider la page une fois le profil connu. */
  if (!profile || platformAdminLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Chargement…
      </div>
    )
  }

  if (platformAdmin) {
    if (!espaceEtudiantChoisi) {
      return <ChoixEspace onChoisirEtudiant={() => setEspaceEtudiantChoisi(true)} />
    }
    return <MonEspaceEtudiant />
  }

  if (profile.role === 'professeur') {
    return <Navigate to="/professeur/calendrier" replace />
  }
  if (profile.role === 'admin_etablissement') {
    return <Navigate to="/admin/prospects" replace />
  }

  return <MonEspaceEtudiant />
}
