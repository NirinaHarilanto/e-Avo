import { useProfileContext } from '../../context/ProfileContext'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { DossierEtudiantVue } from './DossierEtudiantVue'
import { DemandeForfaitEtudiant } from './DemandeForfaitEtudiant'
import { PlanningVagueEtudiant } from './PlanningVagueEtudiant'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
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
