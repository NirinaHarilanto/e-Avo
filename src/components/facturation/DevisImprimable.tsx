import { useEtablissement } from '../../hooks/useEtablissement'
import type { Database } from '../../types/database.types'
import { MentionsEtablissement } from '../shared/MentionsEtablissement'
import { TamponEtablissement } from '../shared/TamponEtablissement'
import { OverlayImpression, type ActionImpression } from './OverlayImpression'
import { TableauLignesImprimable } from './TableauLignesImprimable'

type Quote = Database['public']['Tables']['quotes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

interface DevisImprimableProps {
  devis: Quote
  etudiant: Profile | null
  onFermer: () => void
  action?: ActionImpression
}

export function DevisImprimable({ devis, etudiant, onFermer, action }: DevisImprimableProps) {
  const etablissement = useEtablissement(devis.etablissement_id)

  return (
    <OverlayImpression onFermer={onFermer} nomFichier={`Devis ${devis.numero}`} actionInitiale={action}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>{etablissement?.nom ?? "Établissement"}</h1>
          <MentionsEtablissement etablissement={etablissement} variante="document-financier" />
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

      {/* Bloc conditionné à la présence de notes OU d'un tampon — sinon un `marginTop` vide
          laisserait un blanc en bas d'un devis sans l'un ni l'autre. */}
      {(devis.notes || etablissement?.tampon_path) && (
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
          {devis.notes ? <p style={{ fontSize: 12, color: '#555', margin: 0, flex: 1 }}>{devis.notes}</p> : <div />}
          <TamponEtablissement etablissement={etablissement} />
        </div>
      )}
    </OverlayImpression>
  )
}
