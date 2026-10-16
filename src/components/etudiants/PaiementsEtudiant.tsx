import { EtudiantLayout } from '../layout/EtudiantLayout'
import { ListeFactures } from '../shared/ListeFactures'
import { EnTetePage } from '../ui/EnTetePage'

export function PaiementsEtudiant() {
  return (
    <EtudiantLayout actif="Mes paiements">
      <EnTetePage
        titre="Mes paiements"
      />

      <ListeFactures
        colonne="student_id"
        titreVide="Aucune facture ni reçu pour le moment"
        descriptionVide="Vos documents financiers apparaîtront ici dès que l’établissement aura émis une première facture ou enregistré un premier règlement."
      />
    </EtudiantLayout>
  )
}
