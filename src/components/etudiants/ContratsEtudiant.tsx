import { EtudiantLayout } from '../layout/EtudiantLayout'
import { MesContrats } from '../shared/MesContrats'
import { EnTetePage } from '../ui/EnTetePage'

export function ContratsEtudiant() {
  return (
    <EtudiantLayout actif="Mes contrats">
      <EnTetePage
        titre="Mes contrats"
      />

      <MesContrats />
    </EtudiantLayout>
  )
}
