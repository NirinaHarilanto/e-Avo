import { useProfileContext } from '../../context/ProfileContext'
import { AdminLayout } from '../layout/AdminLayout'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { EtatChargement } from '../ui/Etats'
import { InformationsPersonnelles } from './InformationsPersonnelles'
import { PanneauSignature } from './PanneauSignature'
import { IntegrationGoogleCalendarPersonnel } from './IntegrationGoogleCalendarPersonnel'

/* "Mon profil" : coordonnées personnelles et signature, en self-service pour les 3 rôles (demande
   client du 2026-09-17). Un seul composant plutôt que 3 pages quasi identiques : le contenu ne
   change jamais, seul le Layout (donc la navigation) diffère selon le rôle du profil connecté.
   InformationsPersonnelles.tsx est déjà en self-service via la policy `profiles_self_update`
   (0004) — jusqu'ici seul un admin l'utilisait pour éditer la fiche d'un AUTRE profil ; c'est la
   première fois qu'il est monté avec `personne = profil connecté`.

   Exception admin depuis le 2026-10-08 (demande client) : la signature a déménagé dans Profil
   HOC, avec l'identité de l'établissement et l'équipe d'administrateurs — un admin n'a donc plus
   besoin de venir ici pour ce geste précis. Cette page reste pour ses coordonnées et sa connexion
   Google Calendar, renommée « Profils admin ». Professeur et étudiant sont inchangés : la
   signature reste ici pour ces deux rôles. */
export function MonProfil() {
  const { profile, loading, rafraichirProfil } = useProfileContext()

  if (loading || !profile) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: 24 }}>
        <EtatChargement lignes={3} hauteur={80} />
      </div>
    )
  }

  const estAdmin = profile.role === 'admin_etablissement'

  // Demande client du 2026-10-05 : « chaque professeur et admin [...] connecté[s] [...] avec son
  // propre agenda » — la connexion personnelle à Google Calendar n'a de sens que pour ces deux
  // rôles, pas pour un étudiant.
  const peutConnecterAgendaPersonnel = estAdmin || profile.role === 'professeur'

  const contenu = (
    <>
      <EnTetePage
        titre={estAdmin ? 'Profils admin' : 'Mon profil'}
        description={
          estAdmin
            ? 'Vos coordonnées personnelles. Votre signature se dépose désormais dans Profil HOC.'
            : 'Vos coordonnées et votre signature, utilisées notamment lors de la signature de vos contrats.'
        }
      />
      <InformationsPersonnelles
        personne={profile}
        onChange={rafraichirProfil}
        extra={!estAdmin && <PanneauSignature profile={profile} onChange={rafraichirProfil} />}
      />
      {peutConnecterAgendaPersonnel && (
        <div style={{ marginTop: 20 }}>
          <IntegrationGoogleCalendarPersonnel />
        </div>
      )}
    </>
  )

  if (estAdmin) {
    return <AdminLayout actif="Profils admin">{contenu}</AdminLayout>
  }
  if (profile.role === 'professeur') {
    return <ProfesseurLayout actif="Mon profil">{contenu}</ProfesseurLayout>
  }
  return <EtudiantLayout actif="Mon profil">{contenu}</EtudiantLayout>
}
