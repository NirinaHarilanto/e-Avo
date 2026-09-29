import { useEtablissement } from '../../hooks/useEtablissement'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { formaterHeures } from '../../lib/heures'
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
   pour l'impression et le PDF, ou dans la fenêtre de validation de l'admin. `tauxCourant` sert
   d'estimation tant que le relevé n'est pas validé (le taux définitif est figé à la validation). */
export function TimesheetDocument({
  timesheet,
  nomProfesseur,
  tauxCourant,
}: {
  timesheet: Timesheet
  nomProfesseur: string
  tauxCourant?: number | null
}) {
  const etablissement = useEtablissement(timesheet.etablissement_id)
  const taux = timesheet.statut === 'valide' ? timesheet.taux_horaire : (tauxCourant ?? timesheet.taux_horaire)
  const total = taux ? Math.round(Number(timesheet.total_heures) * taux * 100) / 100 : null
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
            <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: 12.5 }}>Heures</th>
            <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: 12.5 }}>Montant</th>
          </tr>
        </thead>
        <tbody>
          {timesheet.lignes.map((l) => (
            <tr key={l.hour_ledger_id}>
              <td style={cellule}>{l.debut ? formaterDansFuseauEtablissement(l.debut, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
              <td style={cellule}>{l.eleves || '—'}</td>
              <td style={{ ...cellule, textAlign: 'right' }}>{formaterHeures(l.heures)}</td>
              <td style={{ ...cellule, textAlign: 'right' }}>{taux ? montant(l.heures * taux) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, textAlign: 'right', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span>Total des heures : {formaterHeures(Number(timesheet.total_heures))}</span>
        <span>Taux horaire : {taux ? montant(taux) : 'non renseigné'}</span>
        <span style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Total à payer : {total != null ? montant(total) : '—'}</span>
        {timesheet.statut !== 'valide' && taux && (
          <span style={{ fontSize: 11, color: '#666' }}>Montant estimé : définitif à la validation par l’établissement.</span>
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
    </div>
  )
}
