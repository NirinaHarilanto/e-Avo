import { useProfileContext } from '../../context/ProfileContext'
import { useDocuments } from '../../hooks/useDocuments'
import { useSessionReports } from '../../hooks/useSessionReports'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { ExplorateurDocuments } from '../documents/ExplorateurDocuments'
import { ListeComptesRendus } from '../shared/ListeComptesRendus'
import { EnTetePage } from '../ui/EnTetePage'
import { GroupeSection } from '../ui/Section'
import { EtatChargement, MessageErreur } from '../ui/Etats'

export function DocumentsEtudiant() {
  const { profile } = useProfileContext()
  const { documents, loading, erreur, recharger } = useDocuments(profile?.id)
  const { comptesRendus, loading: chargementComptesRendus, erreur: erreurComptesRendus } = useSessionReports()

  return (
    <EtudiantLayout actif="Mes documents">
      <EnTetePage
        titre="Mes documents"
      />

      {/* Comptes rendus en premier depuis la refonte du 2026-10-16 : c'est l'ordre de la maquette
          « Mes documents », et le plus utile à l'élève — ce qu'il vient lire après un cours passe
          avant ses propres pièces justificatives. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <GroupeSection titre="Comptes rendus de mes cours">
          <ListeComptesRendus
            comptesRendus={comptesRendus}
            loading={chargementComptesRendus}
            erreur={erreurComptesRendus}
            masquerParticipants
            titreVide="Aucun compte rendu pour le moment"
            descriptionVide="Votre professeur peut rédiger un compte rendu après chaque séance. Ils apparaîtront ici automatiquement, du plus récent au plus ancien."
          />
        </GroupeSection>

        {/* Un bloc « Documents de l'établissement » a existé brièvement ici le 2026-10-31, pour
            lister en lecture les fichiers de Documents › Partageables de l'administration —
            fondé sur l'idée qu'un fichier déposé là devenait visible de tout l'établissement.
            Le client a corrigé l'exigence le jour même, capture à l'appui : un fichier
            partageable reste dans l'espace de son déposant tant qu'il n'a pas été partagé
            nommément (voir admin/DocumentsAdmin.tsx). Ce qu'un professeur ou l'administration
            partage avec cet élève se retrouve dans « Mes fichiers partagés », juste en dessous
            dans « Mes pièces » — rien à dupliquer ici. */}
        <GroupeSection titre="Mes pièces">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {erreur && <MessageErreur>{erreur}</MessageErreur>}
            {loading || !profile ? (
              <EtatChargement lignes={3} hauteur={52} />
            ) : (
              <ExplorateurDocuments
                documents={documents}
                ownerProfileId={profile.id}
                etablissementId={profile.etablissement_id}
                peutSupprimer={(d) => d.uploaded_by_profile_id === profile.id}
                onChange={recharger}
                messageVide="Votre dossier est vide pour l’instant. Créez un dossier pour vous organiser, ou déposez directement une première pièce."
              />
            )}
          </div>
        </GroupeSection>
      </div>
    </EtudiantLayout>
  )
}
