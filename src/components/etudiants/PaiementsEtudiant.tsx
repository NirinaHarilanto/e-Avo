import { EtudiantLayout } from '../layout/EtudiantLayout'
import { ListeFactures } from '../shared/ListeFactures'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'

export function PaiementsEtudiant() {
  return (
    <EtudiantLayout actif="Mes paiements">
      <EnTetePage
        titre="Mes paiements"
        description="Vos factures et vos reçus, du plus récent au plus ancien. Un reçu est ajouté automatiquement dès que l’établissement enregistre un règlement de votre part."
      />

      <GuidePage
        id="etudiant-paiements"
        etapes={[
          <>
            Les onglets séparent vos <strong>Factures</strong> de vos <strong>Reçus</strong> : un reçu est ajouté
            automatiquement dès que l’établissement enregistre un règlement de votre part.
          </>,
          <>
            Les trois encadrés résument l’onglet ouvert : le total, ce qui est déjà réglé, et ce qui reste en attente.
          </>,
          <>
            Chaque document se <strong>voit</strong>, s’<strong>imprime</strong> ou se <strong>télécharge</strong> en
            PDF d’un clic.
          </>,
          <>
            <strong>Aucun règlement ne se fait depuis cette page</strong> : elle sert au suivi. Pour payer, ou si un
            montant vous semble inexact, adressez-vous à votre établissement — lui seul peut corriger ces lignes.
          </>,
        ]}
      />

      <ListeFactures
        colonne="student_id"
        titreVide="Aucune facture ni reçu pour le moment"
        descriptionVide="Vos documents financiers apparaîtront ici dès que l’établissement aura émis une première facture ou enregistré un premier règlement."
      />
    </EtudiantLayout>
  )
}
