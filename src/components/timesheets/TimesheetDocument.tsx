import { useEtablissement } from '../../hooks/useEtablissement'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { formaterHeures } from '../../lib/heures'
import { LIBELLE_TYPE_FACTURATION } from '../../lib/remuneration'
import type { Database } from '../../types/database.types'

type Timesheet = Database['public']['Tables']['timesheets']['Row']

export const LABEL_STATUT_TIMESHEET: Record<Timesheet['statut'], string> = {
  soumis: 'En attente de validation',
  valide: 'Validé',
  refuse: 'Refusé',
}

const dateCourte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR')
const montant = (v: number) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Ar`

/* Le TimeSheet mis en page comme une facture (demande client : « il se présentera sous forme de
   facture, avec les informations du TimeSheet »). Papier blanc, à placer dans OverlayImpression
   pour l'impression et le PDF, ou dans la fenêtre de validation de l'admin.

   Depuis 0126 (3 taux horaires, demande client du 2026-10-12 : « afficher le montant gagné [...]
   pour chaque session de cours comptabilisée »), chaque ligne porte son propre type et son propre
   montant — plus de taux unique affiché en pied de page, un relevé mélange souvent plusieurs
   types de séance. `l.montant`/`l.type` sont absents sur les relevés antérieurs à ce chantier :
   la ligne retombe alors sur le total déjà figé du TimeSheet, jamais recalculée après coup. */
export function TimesheetDocument({ timesheet, nomProfesseur }: { timesheet: Timesheet; nomProfesseur: string }) {
  const etablissement = useEtablissement(timesheet.etablissement_id)
  const cellule = { padding: '7px 4px', borderBottom: '1px solid #ddd', fontSize: 12.5 } as const

  return (
    <div style={{ color: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>{etablissement?.nom ?? 'Établissement'}</h1>
          <p style={{ fontSize: 12, color: '#555', margin: '4px 0 0' }}>Relevé des heures enseignées</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>TimeSheet {timesheet.numero}</h2>
          <p style={{ fontSize: 12, color: '#555', margin: '4px 0 0' }}>
            Envoyé le {formaterDansFuseauEtablissement(timesheet.soumis_le, { dateStyle: 'medium' })}
          </p>
          <p style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 0', color: timesheet.statut === 'valide' ? '#1a7a4c' : timesheet.statut === 'refuse' ? '#b3261e' : '#8a6d1a' }}>
            {LABEL_STATUT_TIMESHEET[timesheet.statut]}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 22, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>
          <strong>Professeur :</strong> {nomProfesseur}
        </span>
        <span>
          <strong>Période :</strong> du {dateCourte(timesheet.periode_debut)} au {dateCourte(timesheet.periode_fin)}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #111' }}>
            <th style={{ textAlign: 'left', padding: '8px 4px', fontSize: 12.5 }}>Séance</th>
            <th style={{ textAlign: 'left', padding: '8px 4px', fontSize: 12.5 }}>Élève(s)</th>
            <th style={{ textAlign: 'left', padding: '8px 4px', fontSize: 12.5 }}>Type</th>
            <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: 12.5 }}>Heures</th>
            <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: 12.5 }}>Montant</th>
          </tr>
        </thead>
        <tbody>
          {timesheet.lignes.map((l) => (
            <tr key={l.hour_ledger_id}>
              <td style={cellule}>{l.debut ? formaterDansFuseauEtablissement(l.debut, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
              <td style={cellule}>{l.eleves || '—'}</td>
              <td style={cellule}>{l.type ? LIBELLE_TYPE_FACTURATION[l.type] : '—'}</td>
              <td style={{ ...cellule, textAlign: 'right' }}>{formaterHeures(l.heures)}</td>
              <td style={{ ...cellule, textAlign: 'right' }}>{l.montant != null ? montant(l.montant) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, textAlign: 'right', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span>Total des heures : {formaterHeures(Number(timesheet.total_heures))}</span>
        <span style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Total à payer : {timesheet.montant != null ? montant(timesheet.montant) : '—'}</span>
        {timesheet.statut !== 'valide' && timesheet.montant != null && (
          <span style={{ fontSize: 11, color: '#666' }}>Montant estimé : définitif, ligne par ligne, à la validation par l’établissement.</span>
        )}
      </div>

      {timesheet.commentaire && (
        <p style={{ marginTop: 20, fontSize: 12.5, color: '#333' }}>
          <strong>Commentaire du professeur :</strong> {timesheet.commentaire}
        </p>
      )}
      {timesheet.statut === 'refuse' && timesheet.motif_refus && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: '#b3261e' }}>
          <strong>Motif du refus :</strong> {timesheet.motif_refus}
        </p>
      )}
      {/* Lignes retirées par l'admin avant validation (0126) : tracées à part, jamais mêlées au
          tableau payé ci-dessus, avec le motif donné. */}
      {timesheet.lignes_retirees.length > 0 && (
        <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: '#fdf3e7', border: '1px solid #e9cf94' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#7a5a1a' }}>
            <strong>{timesheet.lignes_retirees.length} ligne(s) retirée(s) par l’administration avant validation</strong>
            {timesheet.justificatif_modification ? ` — ${timesheet.justificatif_modification}` : ''}
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#7a5a1a' }}>
            {timesheet.lignes_retirees.map((l) => (
              <li key={l.hour_ledger_id}>
                {l.debut ? formaterDansFuseauEtablissement(l.debut, { dateStyle: 'medium', timeStyle: 'short' }) : 'Séance'}
                {l.eleves ? ` — ${l.eleves}` : ''} ({formaterHeures(l.heures)})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
