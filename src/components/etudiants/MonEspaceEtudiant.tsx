import { useProfileContext } from '../../context/ProfileContext'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { DossierEtudiantVue } from './DossierEtudiantVue'
import { DemandeForfaitEtudiant } from './DemandeForfaitEtudiant'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { EtatChargement, MessageErreur, MessageInfo } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'

export function MonEspaceEtudiant() {
  const { profile, idEtudiantEffectif } = useProfileContext()
  const { dossier, loading, erreur } = useDossierEtudiant(idEtudiantEffectif ?? undefined)
  /* DUO (0054) : le dossier affiché est celui du binôme, pas forcément le profil qu'on vient de
     créer soi-même — un mot d'explication évite toute confusion à la première connexion. */
  const estSecondaireDuo = !!profile?.duo_partenaire_id

  return (
    <EtudiantLayout actif="Mon dossier">
      <EnTetePage
        titre={profile ? `Bonjour ${profile.prenom}` : 'Mon dossier'}
        description="Bienvenue dans votre espace. Vous retrouvez ici votre professeur, votre programme, vos séances et votre compteur d’heures, mis à jour automatiquement après chaque cours."
      />

      <GuidePage
        id="etudiant-dossier"
        etapes={[
          <>
            Les quatre encadrés du haut résument votre situation : heures suivies, assiduité, prochaine séance et niveau
            évalué. Si un lien <strong>Rejoindre la visio</strong> apparaît, c’est par là que vous entrez en cours.
          </>,
          <>
            Le <strong>parcours pédagogique</strong> liste toutes vos séances, avec votre présence à chacune. Il se
            remplit tout seul, vous n’avez rien à y saisir.
          </>,
          <>
            Le menu de gauche donne accès à vos <strong>documents</strong>, vos <strong>paiements</strong> et vos{' '}
            <strong>contrats</strong>. Une pastille sur la cloche en haut à droite signale une nouveauté.
          </>,
          <>
            Une information vous semble inexacte ? Signalez-le à l’administration de votre établissement : ces données
            sont saisies de leur côté.
          </>,
        ]}
      />

      {estSecondaireDuo && dossier && (
        <div style={{ marginBottom: 14 }}>
          <MessageInfo>
            Vous partagez cet espace en duo avec {dossier.etudiant.prenom} {dossier.etudiant.nom} : vos deux comptes
            donnent accès au même dossier.
          </MessageInfo>
        </div>
      )}

      {loading && <EtatChargement lignes={3} hauteur={110} />}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {!loading && !erreur && !dossier && (
        <EtatVide
          icone="dossier"
          titre="Votre dossier n’est pas encore ouvert"
          description="Votre inscription est enregistrée, mais l’établissement n’a pas encore constitué votre dossier pédagogique. Il apparaîtra ici dès qu’un professeur et un programme vous auront été attribués."
        />
      )}
      {dossier && idEtudiantEffectif && (
        <DossierEtudiantVue dossier={dossier} panneauDemandeForfait={<DemandeForfaitEtudiant studentId={idEtudiantEffectif} />} />
      )}
    </EtudiantLayout>
  )
}
