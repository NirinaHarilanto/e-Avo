import { EtudiantLayout } from '../layout/EtudiantLayout'
import { MesContrats } from '../shared/MesContrats'

export function ContratsEtudiant() {
  return (
    <EtudiantLayout actif="Mes contrats">
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 22 }}>Mes contrats</h1>
      <MesContrats />
    </EtudiantLayout>
  )
}
