import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { Messagerie } from './Messagerie'

export function MessagesEtudiant() {
  return (
    <EtudiantLayout actif="Messages">
      <EnTetePage
        titre="Messages"
        description="Écrivez à l’administration ou à votre professeur, et retrouvez ici tous les messages qui vous sont adressés."
      />

      <GuidePage
        id="etudiant-messages"
        etapes={[
          <>
            <strong>Nouveau message</strong> ouvre l’annuaire de Hari Online Club : vous choisissez la personne à qui
            écrire en tapant son nom.
          </>,
          <>
            Pour une question de planning, d’absence ou de paiement, écrivez à l’<strong>Administration</strong> ; pour
            une question sur le contenu d’un cours, à votre <strong>professeur</strong>.
          </>,
          <>
            Un message reçu déclenche une <strong>notification dans la cloche</strong> en haut de votre espace.
          </>,
        ]}
      />

      <Messagerie />
    </EtudiantLayout>
  )
}
