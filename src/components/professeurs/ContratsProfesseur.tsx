import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { MesContrats } from '../shared/MesContrats'

export function ContratsProfesseur() {
  return (
    <ProfesseurLayout actif="Mes contrats">
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 22 }}>Mes contrats</h1>
      <MesContrats />
    </ProfesseurLayout>
  )
}
