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
            <strong>Nouveau message</strong> ouvre l’annuaire de Hari Online Club : tapez un nom pour choisir le ou les
            destinataires, renseignez l’objet et votre texte, puis <strong>Envoyer</strong>.
          </>,
          <>
            Pour une question de planning, d’absence ou de paiement, écrivez à l’<strong>Administration</strong> ; pour
            une question sur le contenu d’un cours, à votre <strong>professeur</strong>.
          </>,
          <>
            Les onglets séparent les messages <strong>Reçus</strong> — le compteur indique les non lus — des{' '}
            <strong>Envoyés</strong>. Ouvrez un message pour le lire, y <strong>Répondre</strong> ou le supprimer.
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
