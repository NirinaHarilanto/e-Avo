import { useProfileContext } from '../../context/ProfileContext'
import { useDocumentsEtablissement } from '../../hooks/useDocumentsEtablissement'
import { ExplorateurDocuments } from './ExplorateurDocuments'
import { EtatChargement, MessageErreur } from '../ui/Etats'

/* Bibliothèque commune de l'établissement, telle que la voient l'élève et le professeur — demande
   client du 2026-10-31 : « rendre cela possible également dans l'espace professeur et
   étudiants ». Le même explorateur que l'administration, sur la même arborescence (0149), mais
   sans aucun droit d'écriture : on parcourt les dossiers, on ouvre et on télécharge un fichier.

   Un seul composant pour les deux espaces plutôt que deux copies : il n'y a aucune différence
   entre ce que voit un élève et ce que voit un professeur ici, et la RLS en décide de toute
   façon seule. */
export function DocumentsEtablissement() {
  const { profile } = useProfileContext()
  const { documents, loading, erreur, recharger } = useDocumentsEtablissement()

  if (!profile || loading) return <EtatChargement lignes={2} hauteur={52} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <ExplorateurDocuments
        documents={documents}
        /* Sert uniquement à l'upload, désactivé ici, et au chargement des fichiers reçus en
           partage, que la portée « établissement » n'affiche pas. */
        ownerProfileId={profile.id}
        etablissementId={profile.etablissement_id}
        portee="etablissement"
        titreRacine="Documents de l’établissement"
        peutOrganiser={false}
        peutDeposer={false}
        peutSupprimer={() => false}
        /* Un document déjà visible de tout l'établissement n'a pas à être re-partagé depuis
           ici : le bouton n'ouvrirait rien que le destinataire ne puisse déjà consulter. */
        peutPartager={() => false}
        onChange={recharger}
        messageVide="L’établissement n’a pas encore déposé de support commun. Ceux à venir apparaîtront ici."
      />
    </div>
  )
}
