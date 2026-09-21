import { useProfileContext } from '../../context/ProfileContext'
import { useDocuments } from '../../hooks/useDocuments'
import { useSessionReports } from '../../hooks/useSessionReports'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { UploaderDocument } from '../documents/UploaderDocument'
import { ListeDocuments } from '../documents/ListeDocuments'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GroupeSection } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { CompteRenduAffichage } from '../shared/CompteRenduAffichage'

export function DocumentsEtudiant() {
  const { profile } = useProfileContext()
  const { documents, loading, erreur, recharger } = useDocuments(profile?.id)
  const { comptesRendus, loading: chargementComptesRendus } = useSessionReports()

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
            Déposez vos pièces avec le formulaire ci-dessous : choisissez la <strong>catégorie</strong> qui correspond,
            puis le fichier. Formats acceptés : PDF, image ou .docx, jusqu’à 20 Mo.
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
            {profile && <UploaderDocument ownerProfileId={profile.id} etablissementId={profile.etablissement_id} onUploade={recharger} />}
            {erreur && <MessageErreur>{erreur}</MessageErreur>}
            {loading ? (
              <EtatChargement lignes={3} hauteur={52} />
            ) : (
              <div className="card" style={{ padding: 20 }}>
                <ListeDocuments
                  documents={documents}
                  peutSupprimer={(d) => d.uploaded_by_profile_id === profile?.id}
                  onChange={recharger}
                  messageVide="Votre dossier est vide pour l’instant. Utilisez le formulaire ci-dessus pour déposer une première pièce."
                />
              </div>
            )}
          </div>
        </GroupeSection>

        <GroupeSection
          titre="Comptes rendus de mes cours"
          description="Rédigés par votre professeur après chaque séance. Vous ne pouvez pas les modifier."
        >
          {chargementComptesRendus ? (
            <EtatChargement lignes={2} hauteur={78} />
          ) : comptesRendus.length === 0 ? (
            <EtatVide
              icone="documents"
              titre="Aucun compte rendu pour le moment"
              description="Votre professeur peut rédiger un compte rendu après chaque séance. Ils apparaîtront ici automatiquement, du plus récent au plus ancien."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comptesRendus.map(({ rapport, session, professeur }) => (
                <div key={rapport.id} className="card card-lift" style={{ padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <span className="brand-font" style={{ fontSize: 13.5, color: 'var(--ink)' }}>
                      {session ? new Date(session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Séance'}
                    </span>
                    {professeur && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        avec {professeur.prenom} {professeur.nom}
                      </span>
                    )}
                  </div>
                  <CompteRenduAffichage rapport={rapport} />
                </div>
              ))}
            </div>
          )}
        </GroupeSection>
      </div>
    </EtudiantLayout>
  )
}
