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
            Cliquez sur <strong>Je signe</strong>. La mention « Lu et approuvé » et votre nom sont apposés ; si vous
            avez déposé une image de signature dans <strong>Mon profil</strong>, elle s’y ajoute. L’action est
            enregistrée avec sa date et ne s’annule pas depuis votre espace.
          </>,
          <>
            Le pied de chaque ligne indique où en est chaque partie. Le contrat n’est <strong>Signé</strong> que
            lorsque l’établissement et vous avez tous deux signé ; une date limite peut y figurer.
          </>,
          <>
            La signature de votre contrat est la première étape de votre <strong>intégration</strong> : elle est
            constatée automatiquement ici, sans que l’administration ait à la cocher. Les autres étapes
            (onboarding) suivent de son côté.
          </>,
        ]}
      />

      <MesContrats />
    </ProfesseurLayout>
  )
}
