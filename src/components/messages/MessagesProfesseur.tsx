import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { Messagerie } from './Messagerie'

export function MessagesProfesseur() {
  return (
    <ProfesseurLayout actif="Messages">
      <EnTetePage
        titre="Messages"
      />

      <Messagerie />
    </ProfesseurLayout>
  )
}
