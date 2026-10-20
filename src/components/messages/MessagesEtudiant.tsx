import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { Messagerie } from './Messagerie'

export function MessagesEtudiant() {
  return (
    <EtudiantLayout actif="Mes messages">
      <EnTetePage
        titre="Mes messages"
      />

      <Messagerie />
    </EtudiantLayout>
  )
}
