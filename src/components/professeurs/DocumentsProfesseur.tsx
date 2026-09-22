import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useDocuments } from '../../hooks/useDocuments'
import { ExplorateurDocuments } from '../documents/ExplorateurDocuments'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { EtatChargement, MessageErreur } from '../ui/Etats'

/* « Documents de mes élèves » a été retiré (demande client du 2026-09-22) : le mécanisme de
   partage explicite (0059) couvre déjà ce besoin — un professeur qui veut donner un support à
   un élève le PARTAGE depuis son propre espace (clic sur le document → « Partager »), l'élève le
   retrouve dans « Mes fichiers partagés » avec la mention de qui le lui a transmis. Il n'y a
   donc plus besoin d'ouvrir l'arborescence de chaque élève depuis l'espace professeur. */
export function DocumentsProfesseur() {
  const { profile } = useProfileContext()
  const { documents, loading, erreur, recharger } = useDocuments(profile?.id)

  return (
    <ProfesseurLayout actif="Documents">
      <EnTetePage
        titre="Mes documents"
        description="Vos pièces personnelles, organisées comme vous le souhaitez. Pour transmettre un support à un élève, ouvrez le document et partagez-le : il apparaîtra dans son espace, avec votre nom."
      />

      <GuidePage
        id="professeur-documents"
        etapes={[
          <>
            Organisez vos pièces avec des <strong>dossiers</strong> : créez-en, renommez-les, rangez vos fichiers à
            l’intérieur.
          </>,
          <>
            Cliquez un document pour l’ouvrir : vous y trouvez le téléchargement, la suppression, et l’option{' '}
            <strong>Partager</strong>.
          </>,
          <>
            Un document partagé reste chez vous — la personne à qui vous l’avez donné accès le voit dans son
            espace, section <strong>Mes fichiers partagés</strong>, avec votre nom et le mot que vous avez joint.
          </>,
        ]}
      />

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
        />
      )}
    </ProfesseurLayout>
  )
}
