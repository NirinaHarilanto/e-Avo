import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { ListeFactures } from '../shared/ListeFactures'
import { EnTetePage } from '../ui/EnTetePage'

export function FacturesProfesseur() {
  return (
    <ProfesseurLayout actif="Mes factures">
      <EnTetePage
        titre="Mes factures"
      />

      <ListeFactures
        colonne="teacher_id"
        titreVide="Aucune facture pour le moment"
        descriptionVide="Vos factures de rémunération apparaîtront ici automatiquement, dès que l’établissement aura enregistré un premier versement."
      />
    </ProfesseurLayout>
  )
}
