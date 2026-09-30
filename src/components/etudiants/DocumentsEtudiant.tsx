import { useProfileContext } from '../../context/ProfileContext'
import { useDocuments } from '../../hooks/useDocuments'
import { useSessionReports } from '../../hooks/useSessionReports'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { ExplorateurDocuments } from '../documents/ExplorateurDocuments'
import { ListeComptesRendus } from '../shared/ListeComptesRendus'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
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
        description="Vos pièces justificatives d’un côté, les comptes rendus rédigés par votre professeur après chaque cours de l’autre."
      />

      <GuidePage
        id="etudiant-documents"
        etapes={[
          <>
            Organisez votre espace comme vous le souhaitez : <strong>Nouveau dossier</strong> crée un dossier à
            l’endroit où vous êtes, et un dossier peut lui-même en contenir d’autres. Le fil d’Ariane en haut
            vous ramène où vous voulez.
          </>,
          <>
            Déposez vos pièces avec le formulaire : le fichier est rangé dans le dossier ouvert. Choisissez la{' '}
            <strong>catégorie</strong> qui correspond, puis le fichier. Formats acceptés : PDF, image ou .docx,
            jusqu’à 20 Mo.
          </>,
          <>
            Vos documents sont visibles par vous, par votre professeur et par l’administration de votre établissement.
            Vous pouvez supprimer ceux que vous avez vous-même déposés.
          </>,
          <>
            Les <strong>comptes rendus</strong> plus bas sont rédigés par votre professeur après vos séances. Ils
            résument ce qui a été travaillé : relisez-les avant votre cours suivant.
          </>,
        ]}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <GroupeSection titre="Mes pièces" description="Les documents que vous déposez ou que votre établissement ajoute à votre dossier.">
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

        <GroupeSection
          titre="Comptes rendus de mes cours"
          description="Rédigés par votre professeur après chaque séance, avec les supports de cours qu'il y joint. Vous ne pouvez pas les modifier."
        >
          <ListeComptesRendus
            comptesRendus={comptesRendus}
            loading={chargementComptesRendus}
            erreur={erreurComptesRendus}
            masquerParticipants
            titreVide="Aucun compte rendu pour le moment"
            descriptionVide="Votre professeur peut rédiger un compte rendu après chaque séance. Ils apparaîtront ici automatiquement, du plus récent au plus ancien."
          />
        </GroupeSection>
      </div>
    </EtudiantLayout>
  )
}
