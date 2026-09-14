import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { ListeFactures } from '../shared/ListeFactures'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'

export function FacturesProfesseur() {
  return (
    <ProfesseurLayout actif="Mes factures">
      <EnTetePage
        titre="Mes factures"
        description="Les factures émises par l’établissement pour vos rémunérations. Elles sont générées automatiquement au moment du versement, vous n’avez rien à créer."
      />

      <GuidePage
        id="professeur-factures"
        etapes={[
          <>
            Une facture apparaît ici dès que l’établissement enregistre le versement d’une de vos rémunérations.
          </>,
          <>
            Le bouton <strong>Voir / Imprimer</strong> ouvre le document complet. Depuis cette vue, la fonction
            d’impression de votre navigateur permet aussi de l’enregistrer en PDF.
          </>,
          <>
            Le montant dépend de votre <strong>taux horaire</strong> et de vos heures enseignées. Si un chiffre vous
            semble inexact, vérifiez d’abord vos heures dans « Mes heures », puis signalez-le à l’administration.
          </>,
        ]}
      />

      <ListeFactures
        colonne="teacher_id"
        titreVide="Aucune facture pour le moment"
        descriptionVide="Vos factures de rémunération apparaîtront ici automatiquement, dès que l’établissement aura enregistré un premier versement."
      />
    </ProfesseurLayout>
  )
}
