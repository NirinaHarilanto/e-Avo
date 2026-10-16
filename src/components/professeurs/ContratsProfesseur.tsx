import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { MesContrats } from '../shared/MesContrats'
import { EnTetePage } from '../ui/EnTetePage'

export function ContratsProfesseur() {
  return (
    <ProfesseurLayout actif="Mes contrats">
      <EnTetePage
        titre="Mes contrats"
      />

      <MesContrats />
    </ProfesseurLayout>
  )
}
