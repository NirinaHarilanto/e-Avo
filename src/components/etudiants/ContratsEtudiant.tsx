import { EtudiantLayout } from '../layout/EtudiantLayout'
import { MesContrats } from '../shared/MesContrats'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'

export function ContratsEtudiant() {
  return (
    <EtudiantLayout actif="Mes contrats">
      <EnTetePage
        titre="Mes contrats"
        description="Les contrats que votre établissement vous adresse. Vous les signez directement ici : rien à imprimer, à scanner ni à renvoyer."
      />

      <GuidePage
        id="etudiant-contrats"
        etapes={[
          <>
            Ouvrez le contrat avec <strong>Voir / Imprimer</strong> et lisez-le entièrement. C’est la seule façon d’en
            consulter le contenu complet.
          </>,
          <>
            Cliquez ensuite sur <strong>Je signe</strong>. La mention « Lu et approuvé » et votre nom sont apposés ; si
            vous avez déposé une image de signature dans <strong>Mon profil</strong>, elle s’y ajoute.
          </>,
          <>
            Le bas de chaque ligne suit les signatures une par une : celle de l’établissement, la vôtre, et celle de
            votre binôme si vous êtes en duo. Le contrat n’est complet que lorsque toutes sont posées.
          </>,
          <>
            Si une <strong>date limite</strong> est indiquée, signez avant cette échéance. Posez vos questions sur le
            contenu <em>avant</em> de signer : une signature ne se retire pas depuis votre espace.
          </>,
        ]}
      />

      <MesContrats />
    </EtudiantLayout>
  )
}
