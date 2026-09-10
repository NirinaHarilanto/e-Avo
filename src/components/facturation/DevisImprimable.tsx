import { useEtablissement } from '../../hooks/useEtablissement'
import type { Database } from '../../types/database.types'
import { OverlayImpression } from './OverlayImpression'
import { TableauLignesImprimable } from './TableauLignesImprimable'

type Quote = Database['public']['Tables']['quotes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

interface DevisImprimableProps {
  devis: Quote
  etudiant: Profile | null
  onFermer: () => void
}

export function DevisImprimable({ devis, etudiant, onFermer }: DevisImprimableProps) {
  const etablissement = useEtablissement(devis.etablissement_id)

  return (
    <OverlayImpression onFermer={onFermer}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>{etablissement?.nom ?? "Établissement"}</h1>
          <p style={{ fontSize: 12, color: '#555', margin: '4px 0 0' }}>{etablissement?.specialite}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Devis {devis.numero}</h2>
          <p style={{ fontSize: 12, color: '#555', margin: '4px 0 0' }}>Émis le {new Date(devis.date_emission).toLocaleDateString('fr-FR')}</p>
          {devis.date_validite && <p style={{ fontSize: 12, color: '#555', margin: 0 }}>Valable jusqu'au {new Date(devis.date_validite).toLocaleDateString('fr-FR')}</p>}
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 13 }}>
        <strong>Destinataire :</strong> {etudiant?.prenom} {etudiant?.nom}
        {etudiant?.email && <span> — {etudiant.email}</span>}
      </div>

      {devis.objet && (
        <p style={{ marginTop: 12, fontSize: 13 }}>
          <strong>Objet :</strong> {devis.objet}
        </p>
      )}

      <TableauLignesImprimable lignes={devis.lignes} montant_ht={devis.montant_ht} montant_tva={devis.montant_tva} montant_ttc={devis.montant_ttc} />

      {devis.notes && <p style={{ marginTop: 24, fontSize: 12, color: '#555' }}>{devis.notes}</p>}
    </OverlayImpression>
  )
}
