import { useProfileContext } from '../../context/ProfileContext'
import { AdminLayout } from '../layout/AdminLayout'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { EtatChargement } from '../ui/Etats'
import { InformationsPersonnelles } from './InformationsPersonnelles'
import { PanneauSignature } from './PanneauSignature'
import { PanneauPhotoProfil } from './PanneauPhotoProfil'
import { MonAvis } from '../etudiants/MonAvis'
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
      <div style={{ minHeight: '100vh', background: '#f7f4ff', padding: 24 }}>
        <EtatChargement lignes={3} hauteur={80} />
      </div>
    )
  }

  const estAdmin = profile.role === 'admin_etablissement'
  const estEtudiant = profile.role === 'etudiant'

  // Demande client du 2026-10-05 : « chaque professeur et admin [...] connecté[s] [...] avec son
  // propre agenda » — la connexion personnelle à Google Calendar n'a de sens que pour ces deux
  // rôles, pas pour un étudiant.
  const peutConnecterAgendaPersonnel = estAdmin || profile.role === 'professeur'

  const contenu = (
    <>
      <EnTetePage
        titre={estAdmin ? 'Profils admin' : 'Mon profil'}
      />

      <InformationsPersonnelles
        personne={profile}
        onChange={rafraichirProfil}
        extra={
          <>
            {/* La photo reste au-dessus de la signature : c'est l'identité visible de la personne,
                la signature est un outil de contrat. Proposée aux élèves seulement — demande
                client du 2026-10-13 : elle sert à illustrer leur avis dans les témoignages. */}
            {estEtudiant && <PanneauPhotoProfil profile={profile} onChange={rafraichirProfil} />}
            {!estAdmin && <PanneauSignature profile={profile} onChange={rafraichirProfil} />}
          </>
        }
      />
      {/* Sous les informations personnelles : l'avis se nourrit du nom et de la photo juste
          au-dessus — demande client du 2026-10-13. */}
      {estEtudiant && <MonAvis profile={profile} />}
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
