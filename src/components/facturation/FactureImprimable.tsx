import { useEtablissement } from '../../hooks/useEtablissement'
import type { Database } from '../../types/database.types'
import { OverlayImpression } from './OverlayImpression'
import { TableauLignesImprimable } from './TableauLignesImprimable'

type Invoice = Database['public']['Tables']['invoices']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

interface FactureImprimableProps {
  facture: Invoice
  etudiant: Profile | null
  onFermer: () => void
}

export function FactureImprimable({ facture, etudiant, onFermer }: FactureImprimableProps) {
  const etablissement = useEtablissement(facture.etablissement_id)

  return (
    <OverlayImpression onFermer={onFermer}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>{etablissement?.nom ?? "Établissement"}</h1>
          <p style={{ fontSize: 12, color: '#555', margin: '4px 0 0' }}>{etablissement?.specialite}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Facture {facture.numero}</h2>
          <p style={{ fontSize: 12, color: '#555', margin: '4px 0 0' }}>Émise le {new Date(facture.date_emission).toLocaleDateString('fr-FR')}</p>
          {facture.date_echeance && <p style={{ fontSize: 12, color: '#555', margin: 0 }}>Échéance le {new Date(facture.date_echeance).toLocaleDateString('fr-FR')}</p>}
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 13 }}>
        <strong>Destinataire :</strong> {etudiant?.prenom} {etudiant?.nom}
        {etudiant?.email && <span> — {etudiant.email}</span>}
      </div>

      {facture.objet && (
        <p style={{ marginTop: 12, fontSize: 13 }}>
          <strong>Objet :</strong> {facture.objet}
        </p>
      )}

      <TableauLignesImprimable lignes={facture.lignes} montant_ht={facture.montant_ht} montant_tva={facture.montant_tva} montant_ttc={facture.montant_ttc} />

      {facture.date_paiement && (
        <p style={{ marginTop: 16, fontSize: 13, fontWeight: 700, color: '#1a7a4c' }}>Payée le {new Date(facture.date_paiement).toLocaleDateString('fr-FR')}</p>
      )}

      {facture.notes && <p style={{ marginTop: 24, fontSize: 12, color: '#555' }}>{facture.notes}</p>}
    </OverlayImpression>
  )
}
