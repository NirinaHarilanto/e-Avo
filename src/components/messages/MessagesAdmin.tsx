import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { EnTetePage } from '../ui/EnTetePage'
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
