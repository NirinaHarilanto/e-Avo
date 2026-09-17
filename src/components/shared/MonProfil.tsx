import { useProfileContext } from '../../context/ProfileContext'
import { AdminLayout } from '../layout/AdminLayout'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { EtatChargement } from '../ui/Etats'
import { InformationsPersonnelles } from './InformationsPersonnelles'
import { PanneauSignature } from './PanneauSignature'

/* "Mon profil" : coordonnées personnelles et signature, en self-service pour les 3 rôles (demande
   client du 2026-09-17). Un seul composant plutôt que 3 pages quasi identiques : le contenu ne
   change jamais, seul le Layout (donc la navigation) diffère selon le rôle du profil connecté.
   InformationsPersonnelles.tsx est déjà en self-service via la policy `profiles_self_update`
   (0004) — jusqu'ici seul un admin l'utilisait pour éditer la fiche d'un AUTRE profil ; c'est la
   première fois qu'il est monté avec `personne = profil connecté`. */
export function MonProfil() {
  const { profile, loading, rafraichirProfil } = useProfileContext()

  if (loading || !profile) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: 24 }}>
        <EtatChargement lignes={3} hauteur={80} />
      </div>
    )
  }

  const contenu = (
    <>
      <EnTetePage titre="Mon profil" description="Vos coordonnées et votre signature, utilisées notamment lors de la signature de vos contrats." />
      <InformationsPersonnelles
        personne={profile}
        onChange={rafraichirProfil}
        extra={<PanneauSignature profile={profile} onChange={rafraichirProfil} />}
      />
    </>
  )

  if (profile.role === 'admin_etablissement') {
    return <AdminLayout actif="Mon profil">{contenu}</AdminLayout>
  }
  if (profile.role === 'professeur') {
    return <ProfesseurLayout actif="Mon profil">{contenu}</ProfesseurLayout>
  }
  return <EtudiantLayout actif="Mon profil">{contenu}</EtudiantLayout>
}
