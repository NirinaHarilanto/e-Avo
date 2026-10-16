import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useDocuments } from '../../hooks/useDocuments'
import { useSessionReports } from '../../hooks/useSessionReports'
import { ExplorateurDocuments } from '../documents/ExplorateurDocuments'
import { ListeComptesRendus } from '../shared/ListeComptesRendus'
import { EnTetePage } from '../ui/EnTetePage'
import { GroupeSection } from '../ui/Section'
import { EtatChargement, MessageErreur } from '../ui/Etats'

/* « Documents de mes élèves » a été retiré (demande client du 2026-09-22) : le mécanisme de
   partage explicite (0059) couvre déjà ce besoin — un professeur qui veut donner un support à
   un élève le PARTAGE depuis son propre espace (clic sur le document → « Partager »), l'élève le
   retrouve dans « Mes fichiers partagés » avec la mention de qui le lui a transmis. Il n'y a
   donc plus besoin d'ouvrir l'arborescence de chaque élève depuis l'espace professeur. */
export function DocumentsProfesseur() {
  const { profile } = useProfileContext()
  const { documents, loading, erreur, recharger } = useDocuments(profile?.id)
  /* « Mes comptes rendus » (demande client du 2026-09-30) : au même niveau que « Mes pièces »
     ci-dessous, pas un onglet de plus dans l'explorateur — la RLS de session_reports
     (session_reports_teacher_all, 0033) ne renvoie déjà que les comptes rendus rédigés PAR ce
     professeur, aucun filtre à ajouter ici. */
  const { comptesRendus, loading: chargementComptesRendus, erreur: erreurComptesRendus } = useSessionReports()

  return (
    <ProfesseurLayout actif="Documents">
      <EnTetePage
        titre="Mes documents"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <GroupeSection titre="Mes pièces">
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
        </GroupeSection>

        <GroupeSection titre="Mes comptes rendus">
          <ListeComptesRendus
            comptesRendus={comptesRendus}
            loading={chargementComptesRendus}
            erreur={erreurComptesRendus}
            masquerProfesseur
            titreVide="Aucun compte rendu pour le moment"
            descriptionVide="Rédigez un compte rendu depuis votre agenda après avoir clôturé une séance : il apparaîtra ici automatiquement."
          />
        </GroupeSection>
      </div>
    </ProfesseurLayout>
  )
}
