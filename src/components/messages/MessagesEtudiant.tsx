import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { Messagerie } from './Messagerie'

export function MessagesEtudiant() {
  return (
    <EtudiantLayout actif="Messages">
      <EnTetePage
        titre="Messages"
      />

      <Messagerie />
    </EtudiantLayout>
  )
}
