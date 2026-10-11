import { useProfileContext } from '../../context/ProfileContext'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { DossierEtudiantVue } from './DossierEtudiantVue'
import { DemandeForfaitEtudiant } from './DemandeForfaitEtudiant'
import { PlanningVagueEtudiant } from './PlanningVagueEtudiant'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { EtatChargement, MessageErreur, MessageInfo } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'

export function MonEspaceEtudiant() {
  const { profile, idEtudiantEffectif } = useProfileContext()
  const { dossier, loading, erreur, recharger } = useDossierEtudiant(idEtudiantEffectif ?? undefined)
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
            Les quatre encadrés du haut résument votre situation : heures suivies sur votre forfait, assiduité,
            prochaine séance et niveau évalué. Le lien <strong>Rejoindre la visio</strong> y apparaît dès qu’un cours
            est planifié.
          </>,
          <>
            L’onglet <strong>Parcours pédagogique</strong> liste vos séances et votre présence à chacune. Après une
            séance terminée, <strong>Donner votre avis</strong> ouvre une courte enquête : note du cours, pédagogie et
            commentaire.
          </>,
          <>
            L’onglet <strong>Forfait</strong> indique vos heures restantes et son échéance.{' '}
            <strong>Demander un forfait supplémentaire</strong> envoie votre demande à l’administration, qui la valide
            après paiement.
          </>,
          <>
            En cours collectif, l’encadré <strong>Ma classe</strong> en haut de page donne votre professeur, vos
            camarades et le planning de votre classe ; l’onglet <strong>Programme</strong> y remplace le forfait.
          </>,
          <>
            Rien ne se saisit ici : tout est renseigné par votre professeur et par l’administration. Une information
            vous semble inexacte ? Signalez-la depuis <strong>Messages</strong>.
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
      {idEtudiantEffectif && (
        <div style={{ marginBottom: 14 }}>
          <PlanningVagueEtudiant studentId={idEtudiantEffectif} />
        </div>
      )}

      {dossier && idEtudiantEffectif && profile && (
        <DossierEtudiantVue
          dossier={dossier}
          panneauDemandeForfait={<DemandeForfaitEtudiant studentId={idEtudiantEffectif} />}
          satisfactionEtudiantId={profile.id}
          onDossierChange={recharger}
        />
      )}
    </EtudiantLayout>
  )
}
