import { useState } from 'react'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur } from '../../hooks/useCalendrierProfesseur'
import { useDocuments } from '../../hooks/useDocuments'
import { ExplorateurDocuments } from '../documents/ExplorateurDocuments'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GroupeSection } from '../ui/Section'
import { Champ, champStyle } from '../ui/Champ'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'

export function DocumentsProfesseur() {
  const { profile } = useProfileContext()
  const { etudiantsActifs } = useCalendrierProfesseur(profile?.id)
  const [eleveId, setEleveId] = useState<string | null>(null)

  return (
    <ProfesseurLayout actif="Documents">
      <EnTetePage
        titre="Documents"
        description="Vos pièces administratives d’un côté, les dossiers de vos élèves de l’autre. Chaque fichier n’est visible que par les personnes concernées."
      />

      <GuidePage
        id="professeur-documents"
        etapes={[
          <>
            <strong>Mes documents</strong> réunit vos propres pièces (diplômes, pièce d’identité, justificatifs). Elles
            sont visibles par vous et par l’administration de l’établissement.
          </>,
          <>
            <strong>Documents de mes élèves</strong> : choisissez un élève dans la liste déroulante pour consulter son
            dossier ou y déposer un support de cours.
          </>,
          <>
            Choisissez toujours la <strong>catégorie</strong> appropriée au moment du dépôt : c’est elle qui détermine
            qui pourra consulter le fichier.
          </>,
        ]}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <GroupeSection titre="Mes documents" description="Vos pièces administratives, visibles par vous et par l’administration.">
          {profile && <SectionDocuments ownerProfileId={profile.id} etablissementId={profile.etablissement_id} />}
        </GroupeSection>

        <GroupeSection
          titre="Documents de mes élèves"
          description="Le dossier de chaque élève qui vous est actuellement attribué. Vous pouvez y déposer des supports et y consulter les pièces existantes."
        >
          {etudiantsActifs.length === 0 ? (
            <EtatVide
              icone="etudiants"
              titre="Aucun élève attribué"
              description="Les dossiers de vos élèves apparaîtront ici dès que l’administration vous en aura attribué. L’attribution se fait depuis le dossier de l’élève, côté administration."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Champ label="Élève" aide="Sélectionnez un élève pour afficher son dossier de documents." style={{ maxWidth: 320 }}>
                <select value={eleveId ?? ''} onChange={(e) => setEleveId(e.target.value || null)} style={champStyle}>
                  <option value="">Sélectionner un élève…</option>
                  {etudiantsActifs.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.prenom} {e.nom}
                    </option>
                  ))}
                </select>
              </Champ>
              {eleveId && profile ? (
                <SectionDocuments ownerProfileId={eleveId} etablissementId={profile.etablissement_id} />
              ) : (
                <EtatVide
                  compact
                  icone="documents"
                  titre="Aucun élève sélectionné"
                  description="Choisissez un nom dans la liste ci-dessus pour ouvrir son dossier."
                />
              )}
            </div>
          )}
        </GroupeSection>
      </div>
    </ProfesseurLayout>
  )
}

function SectionDocuments({ ownerProfileId, etablissementId }: { ownerProfileId: string; etablissementId: string }) {
  const { profile } = useProfileContext()
  const { documents, loading, erreur, recharger } = useDocuments(ownerProfileId)
  /* Le professeur organise SON espace ; dans celui d'un élève, il dépose et consulte mais ne
     réorganise pas — c'est l'arborescence de l'élève, et la policy update de 0058 la réserve
     d'ailleurs à son propriétaire. */
  const estSonEspace = ownerProfileId === profile?.id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {loading ? (
        <EtatChargement lignes={3} hauteur={52} />
      ) : (
        <ExplorateurDocuments
          documents={documents}
          ownerProfileId={ownerProfileId}
          etablissementId={etablissementId}
          peutOrganiser={estSonEspace}
          peutSupprimer={(d) => d.uploaded_by_profile_id === profile?.id}
          onChange={recharger}
        />
      )}
    </div>
  )
}
