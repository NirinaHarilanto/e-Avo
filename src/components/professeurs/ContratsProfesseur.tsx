import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { MesContrats } from '../shared/MesContrats'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'

export function ContratsProfesseur() {
  return (
    <ProfesseurLayout actif="Mes contrats">
      <EnTetePage
        titre="Mes contrats"
        description="Les contrats que l’établissement vous adresse. La signature se fait directement ici, il n’y a rien à imprimer ni à renvoyer."
      />

      <GuidePage
        id="professeur-contrats"
        etapes={[
          <>
            Ouvrez le contrat avec <strong>Voir / Imprimer</strong> et lisez-le entièrement avant toute signature.
          </>,
          <>
            Cliquez sur <strong>Je signe</strong> pour apposer votre signature. L’action est enregistrée avec sa date et
            ne peut pas être annulée depuis votre espace.
          </>,
          <>
            Le contrat passe au statut <strong>Signé</strong> une fois que les deux parties ont signé. Le pied de chaque
            ligne vous indique où en est chacune d’elles.
          </>,
        ]}
      />

      <MesContrats />
    </ProfesseurLayout>
  )
}
