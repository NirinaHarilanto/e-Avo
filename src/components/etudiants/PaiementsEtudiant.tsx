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
            Les trois encadrés du haut résument votre situation : le total, ce qui est déjà réglé, et ce qui reste en
            attente.
          </>,
          <>
            Le bouton <strong>Voir / Imprimer</strong> ouvre le document complet. Depuis cette vue, la fonction
            d’impression de votre navigateur permet aussi de l’enregistrer en PDF.
          </>,
          <>
            Les règlements se font directement auprès de votre établissement, selon les modalités convenues avec lui.{' '}
            <strong>Aucun paiement ne se fait depuis cette page</strong> : elle sert uniquement au suivi.
          </>,
          <>
            Un montant vous semble incorrect ? Contactez l’administration de votre établissement, qui est seule à
            pouvoir corriger ces lignes.
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
