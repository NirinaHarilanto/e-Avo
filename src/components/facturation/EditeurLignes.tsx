import type { LigneFacturation } from '../../types/database.types'

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 7,
  padding: '7px 9px',
  fontSize: 12.5,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
}

export function calculerTotaux(lignes: LigneFacturation[]) {
  const montant_ht = lignes.reduce((t, l) => t + l.quantite * l.prix_unitaire_ht, 0)
  const montant_tva = lignes.reduce((t, l) => t + l.quantite * l.prix_unitaire_ht * (l.tva_pct / 100), 0)
  return { montant_ht, montant_tva, montant_ttc: montant_ht + montant_tva }
}

interface EditeurLignesProps {
  lignes: LigneFacturation[]
  onChange: (lignes: LigneFacturation[]) => void
}

/* Éditeur des lignes d'un devis/facture (description, quantité, prix unitaire HT, TVA %) —
   partagé entre CreerDevis et CreerFacture. Les totaux sont recalculés en direct côté client
   à partir des lignes, puis figés dans les colonnes montant_ht/tva/ttc à l'enregistrement. */
export function EditeurLignes({ lignes, onChange }: EditeurLignesProps) {
  const { montant_ht, montant_tva, montant_ttc } = calculerTotaux(lignes)

  function modifierLigne(index: number, champ: keyof LigneFacturation, valeur: string | number) {
    onChange(lignes.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lignes.map((ligne, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Description"
            value={ligne.description}
            onChange={(e) => modifierLigne(index, 'description', e.target.value)}
            style={{ ...champStyle, flexGrow: 1, minWidth: 120 }}
          />
          <input
            type="number"
            min={0}
            step="1"
            value={ligne.quantite}
            onChange={(e) => modifierLigne(index, 'quantite', Number(e.target.value))}
            style={{ ...champStyle, width: 60 }}
            title="Quantité"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={ligne.prix_unitaire_ht}
            onChange={(e) => modifierLigne(index, 'prix_unitaire_ht', Number(e.target.value))}
            style={{ ...champStyle, width: 90 }}
            title="Prix unitaire HT"
          />
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={ligne.tva_pct}
            onChange={(e) => modifierLigne(index, 'tva_pct', Number(e.target.value))}
            style={{ ...champStyle, width: 70 }}
            title="TVA %"
          />
          <button
            type="button"
            onClick={() => onChange(lignes.filter((_, i) => i !== index))}
            style={{ fontSize: 13, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...lignes, { description: '', quantite: 1, prix_unitaire_ht: 0, tva_pct: 20 }])}
        style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}
      >
        + Ajouter une ligne
      </button>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'right' }}>
        HT : <strong>{montant_ht.toFixed(2)} €</strong> · TVA : <strong>{montant_tva.toFixed(2)} €</strong> · TTC :{' '}
        <strong style={{ color: 'var(--accent-gold, #e9cf94)' }}>{montant_ttc.toFixed(2)} €</strong>
      </div>
    </div>
  )
}
