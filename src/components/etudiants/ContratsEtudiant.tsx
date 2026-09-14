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
            Cliquez ensuite sur <strong>Je signe</strong>. Votre signature est enregistrée avec sa date et ne peut plus
            être retirée depuis votre espace.
          </>,
          <>
            Le bas de chaque ligne indique où en sont les deux signatures, la vôtre et celle de l’établissement. Le
            contrat passe au statut <strong>Signé</strong> quand les deux sont posées.
          </>,
          <>
            Si une <strong>date limite</strong> est indiquée, signez avant cette échéance. Une question sur le contenu ?
            Posez-la à votre établissement avant de signer.
          </>,
        ]}
      />

      <MesContrats />
    </EtudiantLayout>
  )
}
