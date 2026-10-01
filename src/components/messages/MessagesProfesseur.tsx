import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { Messagerie } from './Messagerie'

export function MessagesProfesseur() {
  return (
    <ProfesseurLayout actif="Messages">
      <EnTetePage
        titre="Messages"
        description="Écrivez à l’administration, à un autre professeur ou à l’un de vos élèves, et retrouvez ici tous les messages qui vous sont adressés."
      />

      <GuidePage
        id="professeur-messages"
        etapes={[
          <>
            <strong>Nouveau message</strong> ouvre l’annuaire : vous pouvez écrire à n’importe quelle personne inscrite
            chez Hari Online Club, et à plusieurs à la fois.
          </>,
          <>
            Chaque destinataire reçoit son propre message : il voit s’il l’a lu ou non, et vous répond directement, sans
            que les autres destinataires soient en copie.
          </>,
          <>
            Un message reçu déclenche une <strong>notification dans la cloche</strong> en haut de votre espace — vous
            n’avez pas besoin de surveiller cette page.
          </>,
        ]}
      />

      <Messagerie />
    </ProfesseurLayout>
  )
}
