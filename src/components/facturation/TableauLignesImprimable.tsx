import type { LigneFacturation } from '../../types/database.types'

interface TableauLignesImprimableProps {
  lignes: LigneFacturation[]
  montant_ht: number
  montant_tva: number
  montant_ttc: number
}

export function TableauLignesImprimable({ lignes, montant_ht, montant_tva, montant_ttc }: TableauLignesImprimableProps) {
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #111' }}>
            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Description</th>
            <th style={{ textAlign: 'right', padding: '8px 4px' }}>Qté</th>
            <th style={{ textAlign: 'right', padding: '8px 4px' }}>PU HT</th>
            <th style={{ textAlign: 'right', padding: '8px 4px' }}>TVA</th>
            <th style={{ textAlign: 'right', padding: '8px 4px' }}>Total HT</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, index) => (
            <tr key={index} style={{ borderBottom: '1px solid #ccc' }}>
              <td style={{ padding: '8px 4px' }}>{ligne.description}</td>
              <td style={{ textAlign: 'right', padding: '8px 4px' }}>{ligne.quantite}</td>
              <td style={{ textAlign: 'right', padding: '8px 4px' }}>{ligne.prix_unitaire_ht.toFixed(2)} €</td>
              <td style={{ textAlign: 'right', padding: '8px 4px' }}>{ligne.tva_pct}%</td>
              <td style={{ textAlign: 'right', padding: '8px 4px' }}>{(ligne.quantite * ligne.prix_unitaire_ht).toFixed(2)} €</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16, textAlign: 'right', fontSize: 14 }}>
        <div>Total HT : {montant_ht.toFixed(2)} €</div>
        <div>Total TVA : {montant_tva.toFixed(2)} €</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Total TTC : {montant_ttc.toFixed(2)} €</div>
      </div>
    </>
  )
}
