import { useEtablissement } from '../../hooks/useEtablissement'
import type { Database } from '../../types/database.types'
import { OverlayImpression } from '../facturation/OverlayImpression'

type Contract = Database['public']['Tables']['contracts']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

interface ContratImprimableProps {
  contrat: Contract
  destinataire: Profile | null
  onFermer: () => void
}

export function ContratImprimable({ contrat, destinataire, onFermer }: ContratImprimableProps) {
  const etablissement = useEtablissement(contrat.etablissement_id)

  return (
    <OverlayImpression onFermer={onFermer}>
      <h1 style={{ fontSize: 20, margin: 0 }}>{etablissement?.nom ?? "Établissement"}</h1>
      <h2 style={{ fontSize: 17, margin: '16px 0 4px' }}>{contrat.titre}</h2>
      <p style={{ fontSize: 12, color: '#555', margin: 0 }}>
        {destinataire ? `${destinataire.prenom} ${destinataire.nom}` : ''} — émis le {new Date(contrat.created_at).toLocaleDateString('fr-FR')}
      </p>

      <div style={{ marginTop: 24, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{contrat.corps_genere}</div>

      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <div>
          <p>Fait pour {etablissement?.nom},</p>
          <p style={{ marginTop: 40 }}>Signature</p>
        </div>
        <div>
          <p>Fait pour {destinataire ? `${destinataire.prenom} ${destinataire.nom}` : 'le destinataire'},</p>
          <p style={{ marginTop: 40 }}>Signature</p>
        </div>
      </div>
    </OverlayImpression>
  )
}
