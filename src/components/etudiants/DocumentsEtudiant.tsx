import { useProfileContext } from '../../context/ProfileContext'
import { useDocuments } from '../../hooks/useDocuments'
import { useSessionReports } from '../../hooks/useSessionReports'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { ExplorateurDocuments } from '../documents/ExplorateurDocuments'
import { DocumentsEtablissement } from '../documents/DocumentsEtablissement'
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

        {/* Bibliothèque commune (0149, demande client du 2026-10-31) : les supports déposés
            par l'administration dans Documents › Partageables n'étaient listés nulle part côté
            élève, alors que la RLS les lui ouvre depuis 0033. En lecture seule. */}
        <GroupeSection titre="Documents de l’établissement">
          <DocumentsEtablissement />
        </GroupeSection>

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
