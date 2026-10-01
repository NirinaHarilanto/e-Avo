import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { Onglets } from '../ui/Onglets'
import { Messagerie } from './Messagerie'
import { TemplatesEmails } from './TemplatesEmails'

type Onglet = 'messages' | 'templates'

/* La sous-section « Template e-mails » n'existe que côté admin (demande client du 2026-10-01) :
   les espaces professeur et étudiant n'ont que la messagerie interne. */
export function MessagesAdmin() {
  const [onglet, setOnglet] = useState<Onglet>('messages')

  return (
    <AdminLayout actif="Messages">
      <EnTetePage
        titre="Messages"
        description="La messagerie interne de Hari Online Club, et les modèles d’e-mails du parcours apprenant à envoyer en deux clics."
      />

      <GuidePage
        id="admin-messages"
        compact
        etapes={[
          <>
            <strong>Messages</strong> : la messagerie interne. Vous écrivez à n’importe quelle personne inscrite — élève,
            professeur ou collègue — et chacun reçoit une notification dans sa cloche.
          </>,
          <>
            <strong>Template e-mails</strong> : les 22 modèles du parcours apprenant (prospection, inscription,
            démarrage, suivi, satisfaction, réclamations). « Utiliser » prépare le mail, le pré-remplit, et vous le
            relisez avant l’envoi.
          </>,
          <>
            Renseignez une fois <strong>« Liens et numéros réutilisés »</strong> (lien de réservation, Orange Money,
            Mvola, dates de test oral) : ils se glisseront seuls dans tous les modèles qui les mentionnent.
          </>,
          <>
            « Enregistrer » met le mail de côté en <strong>brouillon</strong> sans toucher au modèle ; vous le reprenez
            plus tard depuis le haut de cette page.
          </>,
        ]}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Onglets
          etiquette="Sections des messages"
          actif={onglet}
          onChange={setOnglet}
          onglets={[
            { value: 'messages', label: 'Messages' },
            { value: 'templates', label: 'Template e-mails' },
          ]}
          compact
        />

        {onglet === 'messages' ? <Messagerie /> : <TemplatesEmails />}
      </div>
    </AdminLayout>
  )
}
