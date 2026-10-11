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
            Une facture est émise dès que l’administration <strong>valide un de vos TimeSheets</strong> : vous n’avez
            rien à créer ici, tout part de l’envoi que vous faites depuis « Mes heures ».
          </>,
          <>
            Les onglets séparent vos <strong>Factures</strong> de vos <strong>Reçus</strong>, et les trois encadrés
            résument le total, ce qui est réglé et ce qui reste en attente.
          </>,
          <>
            Chaque document se <strong>voit</strong>, s’<strong>imprime</strong> ou se <strong>télécharge</strong> en PDF d’un clic.
          </>,
          <>
            Le montant dépend de votre <strong>taux horaire</strong> et des heures clôturées que vous avez déclarées.
            Si un chiffre vous semble inexact, vérifiez d’abord « Mes heures », puis signalez-le à l’administration.
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
